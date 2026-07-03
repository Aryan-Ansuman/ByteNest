/**
 * Temporal Answer Decay — Phase 3.
 * Scheduled nightly freshness recomputation job.
 *
 * Appwrite Function handler wired to a schedule trigger ("0 2 * * *" —
 * 02:00 UTC, sequenced after rebuild-tag-expert-registry which runs
 * hourly on the hour so this doesn't overlap the top-of-hour run). Also
 * exported as a standalone async function for CLI use.
 *
 * appwrite.json wiring (add to the "functions" array):
 * {
 *   "$id": "recompute-answer-freshness",
 *   "name": "Recompute Answer Freshness",
 *   "runtime": "node-18.0",
 *   "execute": ["any"],
 *   "events": [],
 *   "schedule": "0 2 * * *",
 *   "timeout": 900,
 *   "entrypoint": "src/main.js",
 *   "commands": "npm install",
 *   "path": "functions/recompute-answer-freshness"
 * }
 *
 * Run manually:  npx tsx scripts/run-freshness-job.ts
 */

import { Query, ID, Models } from "node-appwrite";
import {
  db,
  answerCollection,
  questionCollection,
  freshnessNotificationsCollection,
  freshnessSnapshotsCollection,
  notificationsCollection,
} from "@/models/name";
import { databases } from "@/models/server/config";
import { listAllDocuments } from "@/lib/appwrite-pagination";
import { markdownToPlainExcerpt } from "@/lib/sanitize";
import { computeFreshness } from "./compute-freshness";
import { compareVersion } from "./version-comparison";
import { fetchPackageLatestRelease } from "./fetch-package-latest-release";
import { getCachedRelease, isCacheFresh } from "./package-release-cache-repository";
import { AUTHOR_VERIFICATION_SUPPRESSION_DAYS, NOTIFICATION_RETHROTTLE_DAYS } from "./config";
import { recomputeQuestionFreshnessIndicator } from "./question-freshness-indicator";
import type { CachedRelease } from "./package-release-cache-repository";
import type { FreshnessLabel, TechEcosystem } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ─── Types ──────────────────────────────────────────────────────────────

type AnswerFreshnessDoc = Models.Document & {
  $id: string;
  authorId: string;
  questionId: string;
  versionMax: string | null;
  techPackage: string | null;
  techEcosystem: TechEcosystem | null;
  stalenessVoteCount: number;
  $createdAt: string;
  verifiedByAuthorAt: string | null;
  freshnessLabel: FreshnessLabel | null;
  freshnessNotifiedAt: string | null;
};

type TransitionEvent = {
  answerId: string;
  authorId: string;
  questionId: string;
  techPackage: string | null;
  techEcosystem: TechEcosystem | null;
  versionMax: string | null;
  stalenessVoteCount: number;
  newLabel: "outdated" | "stale";
};

export type FreshnessJobSummary = {
  totalAnswersProcessed: number;
  freshCount: number;
  agingCount: number;
  outdatedCount: number;
  staleCount: number;
  averageFreshnessScore: number;
  topOutdatedPackages: Array<{ techPackage: string; count: number }>;
  transitionsToOutdated: number;
  transitionsToStale: number;
  notificationsQueued: number;
  packagesRefreshed: number;
  packageFetchFailures: number;
  answerWriteErrors: number;
  durationMs: number;
};

// ─── Scheduled job entry point ─────────────────────────────────────────────

export async function freshnessJobHandler({
  log,
  error,
}: {
  log: (msg: string) => void;
  error: (msg: string) => void;
}) {
  log("[freshness-job] Starting nightly freshness recomputation…");

  try {
    const summary = await runFreshnessJob({
      onStep: (msg) => log(`[freshness-job] ${msg}`),
      onAnswerError: (answerId, err: any) => error(`[freshness-job] Failed to update answer ${answerId}: ${err?.message}`),
    });

    log(
      `[freshness-job] Done — processed: ${summary.totalAnswersProcessed}, ` +
      `fresh: ${summary.freshCount}, aging: ${summary.agingCount}, ` +
      `outdated: ${summary.outdatedCount}, stale: ${summary.staleCount}, ` +
      `avg score: ${summary.averageFreshnessScore.toFixed(1)}, ` +
      `notifications queued: ${summary.notificationsQueued}, ` +
      `write errors: ${summary.answerWriteErrors}, ` +
      `duration: ${summary.durationMs}ms`
    );
  } catch (err: any) {
    error(`[freshness-job] Job crashed: ${err?.message}`);
    throw err;
  }
}

// ─── Standalone runner ──────────────────────────────────────────────────

export async function runFreshnessJob(options?: {
  onStep?: (msg: string) => void;
  onAnswerError?: (answerId: string, err: unknown) => void;
}): Promise<FreshnessJobSummary> {
  const startedAt = Date.now();
  const log = options?.onStep ?? (() => {});

  // ── Step 1 — refresh the package cache ──────────────────────────────
  log("Step 1: collecting unique packages due for a cache refresh…");
  const { cacheMap, packagesRefreshed, packageFetchFailures } = await refreshPackageCache(log);
  log(`Step 1 done — ${cacheMap.size} unique packages in cache, ${packagesRefreshed} refreshed, ${packageFetchFailures} fetch failures`);

  // ── Step 2 — recompute freshness for every answer ───────────────────
  log("Step 2: recomputing freshness across all answers…");
  const {
    processed,
    labelCounts,
    scoreSum,
    packageOutdatedCounts,
    transitions,
    answerWriteErrors,
    questionIdsWithLabelChange,
  } = await recomputeAllAnswers(cacheMap, log, options?.onAnswerError);
  log(`Step 2 done — ${processed} answers processed, ${transitions.length} label transitions, ${answerWriteErrors} write errors`);

  // ── Step 2.5 — refresh the question-card freshness indicator ────────
  // Runs only for questions whose answers actually crossed a label
  // boundary tonight — most questions are untouched on any given night.
  log(`Step 2.5: refreshing freshness indicator for ${questionIdsWithLabelChange.size} affected questions…`);
  const questionIndicatorsUpdated = await recomputeQuestionIndicatorsBatched(Array.from(questionIdsWithLabelChange));
  log(`Step 2.5 done — ${questionIndicatorsUpdated} question indicators refreshed`);

  // ── Step 3 — queue notifications for outdated/stale transitions ─────
  log("Step 3: queuing notifications for threshold-crossing answers…");
  const notificationsQueued = await queueNotifications(transitions, cacheMap, log);
  log(`Step 3 done — ${notificationsQueued} notifications queued`);

  // ── Step 4 — write the observability snapshot ────────────────────────
  const durationMs = Date.now() - startedAt;
  const summary: FreshnessJobSummary = {
    totalAnswersProcessed: processed,
    freshCount: labelCounts.fresh,
    agingCount: labelCounts.aging,
    outdatedCount: labelCounts.outdated,
    staleCount: labelCounts.stale,
    averageFreshnessScore: processed > 0 ? scoreSum / processed : 0,
    topOutdatedPackages: topPackages(packageOutdatedCounts, 10),
    transitionsToOutdated: transitions.filter((t) => t.newLabel === "outdated").length,
    transitionsToStale: transitions.filter((t) => t.newLabel === "stale").length,
    notificationsQueued,
    packagesRefreshed,
    packageFetchFailures,
    answerWriteErrors,
    durationMs,
  };

  log("Step 4: writing freshness snapshot…");
  await writeSnapshot(summary);
  log("Step 4 done");

  return summary;
}

// ─── Step 1 ──────────────────────────────────────────────────────────────

async function refreshPackageCache(
  log: (msg: string) => void
): Promise<{ cacheMap: Map<string, CachedRelease>; packagesRefreshed: number; packageFetchFailures: number }> {
  const { documents: answersWithPackages } = await listAllDocuments<AnswerFreshnessDoc>(answerCollection, [
    Query.isNotNull("techPackage"),
    Query.select(["techPackage", "techEcosystem"]),
  ]);

  const uniquePairs = new Map<string, { techPackage: string; techEcosystem: TechEcosystem }>();
  for (const answer of answersWithPackages) {
    if (!answer.techPackage || !answer.techEcosystem) continue;
    const key = cacheKey(answer.techPackage, answer.techEcosystem);
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, { techPackage: answer.techPackage, techEcosystem: answer.techEcosystem });
    }
  }

  const cacheMap = new Map<string, CachedRelease>();
  let packagesRefreshed = 0;
  let packageFetchFailures = 0;

  for (const { techPackage, techEcosystem } of Array.from(uniquePairs.values())) {
    const key = cacheKey(techPackage, techEcosystem);
    try {
      const existing = await getCachedRelease(techPackage, techEcosystem);
      if (existing && isCacheFresh(existing)) {
        cacheMap.set(key, existing);
        continue;
      }

      const fetched = await fetchPackageLatestRelease(techPackage, techEcosystem);
      if (fetched) {
        // fetchPackageLatestRelease already wrote through to the cache on
        // success, or returned the pre-existing cached value on failure —
        // either way, re-read so cacheMap holds the $id needed for later use.
        const refreshed = await getCachedRelease(techPackage, techEcosystem);
        if (refreshed) {
          cacheMap.set(key, refreshed);
          packagesRefreshed += 1;
        }
      } else {
        packageFetchFailures += 1;
        log(`No cache and fetch failed for ${techEcosystem}:${techPackage} — answers using it get time-only decay tonight`);
      }
    } catch (err: any) {
      packageFetchFailures += 1;
      log(`Unexpected error refreshing ${techEcosystem}:${techPackage} — ${err?.message}`);
    }
  }

  return { cacheMap, packagesRefreshed, packageFetchFailures };
}

// ─── Step 2 ──────────────────────────────────────────────────────────────

async function recomputeAllAnswers(
  cacheMap: Map<string, CachedRelease>,
  log: (msg: string) => void,
  onAnswerError?: (answerId: string, err: unknown) => void
) {
  const { documents: answers } = await listAllDocuments<AnswerFreshnessDoc>(answerCollection, [
    Query.select([
      "$id",
      "authorId",
      "questionId",
      "versionMax",
      "techPackage",
      "techEcosystem",
      "stalenessVoteCount",
      "$createdAt",
      "verifiedByAuthorAt",
      "freshnessLabel",
      "freshnessNotifiedAt",
    ]),
  ]);

  let processed = 0;
  let answerWriteErrors = 0;
  const labelCounts: Record<FreshnessLabel, number> = { fresh: 0, aging: 0, outdated: 0, stale: 0 };
  let scoreSum = 0;
  const packageOutdatedCounts = new Map<string, number>();
  const transitions: TransitionEvent[] = [];
  const questionIdsWithLabelChange = new Set<string>();

  for (const answer of answers) {
    try {
      const { effectiveCreatedAt } = resolveEffectiveAge(answer);
      const ageInMonths = monthsSince(effectiveCreatedAt);

      const cached = answer.techPackage && answer.techEcosystem
        ? cacheMap.get(cacheKey(answer.techPackage, answer.techEcosystem))
        : undefined;

      const isVersionTagged = Boolean(answer.versionMax && cached);
      const comparison = isVersionTagged && cached
        ? compareVersion(answer.versionMax as string, cached)
        : { majorVersionsBehind: null, isMinorVersionBehindOnly: false };

      const result = computeFreshness({
        ageInMonths,
        isVersionTagged,
        majorVersionsBehind: comparison.majorVersionsBehind,
        isMinorVersionBehindOnly: comparison.isMinorVersionBehindOnly,
        stalenessVoteCount: answer.stalenessVoteCount ?? 0,
      });

      const previousLabel = answer.freshnessLabel;
      if (previousLabel !== result.freshnessLabel) {
        // Question-card indicator (Phase 8) cares about ANY label change —
        // an answer recovering via "still valid" can push a question back
        // from amber to green, not just the reverse.
        questionIdsWithLabelChange.add(answer.questionId);
      }
      if (
        previousLabel !== result.freshnessLabel &&
        (result.freshnessLabel === "outdated" || result.freshnessLabel === "stale")
      ) {
        transitions.push({
          answerId: answer.$id,
          authorId: answer.authorId,
          questionId: answer.questionId,
          techPackage: answer.techPackage,
          techEcosystem: answer.techEcosystem,
          versionMax: answer.versionMax,
          stalenessVoteCount: answer.stalenessVoteCount ?? 0,
          newLabel: result.freshnessLabel,
        });
      }

      await databases.updateDocument(db, answerCollection, answer.$id, {
        freshnessScore: result.freshnessScore,
        freshnessLabel: result.freshnessLabel,
        lastFreshnessCheck: new Date().toISOString(),
      });

      processed += 1;
      scoreSum += result.freshnessScore;
      labelCounts[result.freshnessLabel] += 1;

      if (
        (result.freshnessLabel === "outdated" || result.freshnessLabel === "stale") &&
        answer.techPackage
      ) {
        packageOutdatedCounts.set(answer.techPackage, (packageOutdatedCounts.get(answer.techPackage) ?? 0) + 1);
      }
    } catch (err) {
      answerWriteErrors += 1;
      onAnswerError?.(answer.$id, err);
    }
  }

  return { processed, labelCounts, scoreSum, packageOutdatedCounts, transitions, answerWriteErrors, questionIdsWithLabelChange };
}

/**
 * If the author confirmed "still valid" within the suppression window, the
 * effective age used for time decay resets to the verification date rather
 * than the original post date — an explicit human confirmation is worth
 * more than silent aging.
 */
function resolveEffectiveAge(answer: AnswerFreshnessDoc): { effectiveCreatedAt: string } {
  if (answer.verifiedByAuthorAt) {
    const verifiedDaysAgo = (Date.now() - new Date(answer.verifiedByAuthorAt).getTime()) / MS_PER_DAY;
    if (verifiedDaysAgo < AUTHOR_VERIFICATION_SUPPRESSION_DAYS) {
      return { effectiveCreatedAt: answer.verifiedByAuthorAt };
    }
  }
  return { effectiveCreatedAt: answer.$createdAt };
}

// ─── Step 2.5 ────────────────────────────────────────────────────────────

const QUESTION_INDICATOR_BATCH_SIZE = 10;

/**
 * recomputeQuestionFreshnessIndicator never throws (it swallows its own
 * errors), so this just needs to bound concurrency — a question with
 * hundreds of newly-transitioned answers shouldn't fire hundreds of
 * concurrent Appwrite writes at once.
 */
async function recomputeQuestionIndicatorsBatched(questionIds: string[]): Promise<number> {
  for (let i = 0; i < questionIds.length; i += QUESTION_INDICATOR_BATCH_SIZE) {
    const batch = questionIds.slice(i, i + QUESTION_INDICATOR_BATCH_SIZE);
    await Promise.all(batch.map((questionId) => recomputeQuestionFreshnessIndicator(questionId)));
  }
  return questionIds.length;
}

// ─── Step 3 ──────────────────────────────────────────────────────────────

async function queueNotifications(
  transitions: TransitionEvent[],
  cacheMap: Map<string, CachedRelease>,
  log: (msg: string) => void
): Promise<number> {
  let queued = 0;

  for (const transition of transitions) {
    try {
      const answer = await databases.getDocument(db, answerCollection, transition.answerId, [
        Query.select(["content", "verifiedByAuthorAt", "freshnessNotifiedAt"]),
      ]);

      const notifiedAt = answer.freshnessNotifiedAt as string | null;
      const verifiedAt = answer.verifiedByAuthorAt as string | null;

      // Guard 1 — don't re-notify inside the throttle window.
      if (notifiedAt) {
        const daysSinceNotified = (Date.now() - new Date(notifiedAt).getTime()) / MS_PER_DAY;
        if (daysSinceNotified < NOTIFICATION_RETHROTTLE_DAYS) continue;
      }

      // Guard 2 — the author confirmed "still valid" more recently than
      // the last notification fired, so they've already reviewed it since.
      if (notifiedAt && verifiedAt && new Date(verifiedAt).getTime() > new Date(notifiedAt).getTime()) {
        continue;
      }

      await databases.createDocument(db, freshnessNotificationsCollection, ID.unique(), {
        answerId: transition.answerId,
        authorId: transition.authorId,
        techPackage: transition.techPackage,
        freshnessLabel: transition.newLabel,
        createdAt: new Date().toISOString(),
      });

      await createUserFacingNotification(transition, answer.content as string, cacheMap, log);

      await databases.updateDocument(db, answerCollection, transition.answerId, {
        freshnessNotifiedAt: new Date().toISOString(),
      });

      queued += 1;
    } catch (err: any) {
      log(`Failed to queue notification for answer ${transition.answerId} — ${err?.message}`);
    }
  }

  return queued;
}

/**
 * Builds the pull-based notification the bell icon reads. Kept best-effort
 * and separate from the try/catch above's queued-count bump — a failure
 * here shouldn't be silently swallowed by the outer catch's generic log,
 * so it gets its own guard and still lets freshnessNotifiedAt get written
 * (we'd rather skip one bell notification than re-spam next week because
 * this step alone failed while freshness_notifications succeeded).
 */
async function createUserFacingNotification(
  transition: TransitionEvent,
  answerContent: string,
  cacheMap: Map<string, CachedRelease>,
  log: (msg: string) => void
): Promise<void> {
  let questionTitle = "";
  try {
    const question = await databases.getDocument(db, questionCollection, transition.questionId, [
      Query.select(["title"]),
    ]);
    questionTitle = (question.title as string) ?? "";
  } catch {
    // Question may have been deleted since the transition was recorded —
    // the notification still links to the answer, just without a title.
  }

  const cached =
    transition.techPackage && transition.techEcosystem
      ? cacheMap.get(cacheKey(transition.techPackage, transition.techEcosystem))
      : undefined;

  const payload = {
    answerId: transition.answerId,
    questionId: transition.questionId,
    questionTitle,
    answerSnippet: markdownToPlainExcerpt(answerContent ?? "", 140),
    techPackage: transition.techPackage,
    versionMax: transition.versionMax,
    latestVersion: cached?.latestVersion ?? null,
    latestReleaseDate: cached?.latestReleaseDate ?? null,
    reportedCount: transition.stalenessVoteCount,
    freshnessLabel: transition.newLabel,
  };

  try {
    await databases.createDocument(db, notificationsCollection, ID.unique(), {
      userId: transition.authorId,
      type: "answer_outdated",
      payload: JSON.stringify(payload).slice(0, 5000),
      readAt: null,
      createdAt: new Date().toISOString(),
    });
  } catch (err: any) {
    log(`Failed to write bell notification for answer ${transition.answerId} — ${err?.message}`);
  }
}

// ─── Step 4 ──────────────────────────────────────────────────────────────

async function writeSnapshot(summary: FreshnessJobSummary): Promise<void> {
  await databases.createDocument(db, freshnessSnapshotsCollection, ID.unique(), {
    runAt: new Date().toISOString(),
    totalAnswersProcessed: summary.totalAnswersProcessed,
    freshCount: summary.freshCount,
    agingCount: summary.agingCount,
    outdatedCount: summary.outdatedCount,
    staleCount: summary.staleCount,
    averageFreshnessScore: summary.averageFreshnessScore,
    topOutdatedPackages: JSON.stringify(summary.topOutdatedPackages).slice(0, 5000),
    transitionsToOutdated: summary.transitionsToOutdated,
    transitionsToStale: summary.transitionsToStale,
    notificationsQueued: summary.notificationsQueued,
    packagesRefreshed: summary.packagesRefreshed,
    packageFetchFailures: summary.packageFetchFailures,
    answerWriteErrors: summary.answerWriteErrors,
    durationMs: summary.durationMs,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function cacheKey(packageName: string, ecosystem: TechEcosystem): string {
  return `${ecosystem}:${packageName}`;
}

function monthsSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return ms / (30.44 * MS_PER_DAY); // average month length — matches the granularity the formula already operates at
}

function topPackages(counts: Map<string, number>, limit: number): Array<{ techPackage: string; count: number }> {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([techPackage, count]) => ({ techPackage, count }));
}
