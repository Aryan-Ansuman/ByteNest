import { db, answerCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { computeFreshness } from "./compute-freshness";
import { compareVersion } from "./version-comparison";
import { getCachedRelease } from "./package-release-cache-repository";
import { AUTHOR_VERIFICATION_SUPPRESSION_DAYS } from "./config";
import { recomputeQuestionFreshnessIndicator } from "./question-freshness-indicator";
import type { FreshnessLabel, TechEcosystem } from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RecomputeResult = {
  freshnessScore: number;
  freshnessLabel: FreshnessLabel;
} | null; // null means the answer no longer exists — caller treats as a no-op

/**
 * Recomputes freshness for a single answer, reading only from
 * package_release_cache — never hits an external registry. This is what
 * makes the event-driven path (staleness vote cast/retracted) fast enough
 * to run inline rather than waiting for the nightly batch job.
 *
 * Deliberately does NOT record a "transition event" or fire a notification
 * (Phase 3's Step 3 concern) — that stays a nightly-job-only concept, since
 * spamming a notification on every staleness vote would defeat the 30-day
 * rethrottle's purpose.
 */
export async function recomputeAnswerFreshness(answerId: string): Promise<RecomputeResult> {
  const answer = await databases.getDocument(db, answerCollection, answerId).catch(() => null);
  if (!answer) return null;

  const versionMax = answer.versionMax as string | null;
  const techPackage = answer.techPackage as string | null;
  const techEcosystem = answer.techEcosystem as TechEcosystem | null;
  const stalenessVoteCount = (answer.stalenessVoteCount as number) ?? 0;
  const verifiedByAuthorAt = answer.verifiedByAuthorAt as string | null;

  const effectiveCreatedAt = resolveEffectiveAge(answer.$createdAt as string, verifiedByAuthorAt);
  const ageInMonths = monthsSince(effectiveCreatedAt);

  const cached = techPackage && techEcosystem
    ? await getCachedRelease(techPackage, techEcosystem)
    : null;

  const isVersionTagged = Boolean(versionMax && cached);
  const comparison = isVersionTagged && cached
    ? compareVersion(versionMax as string, cached)
    : { majorVersionsBehind: null, isMinorVersionBehindOnly: false };

  const result = computeFreshness({
    ageInMonths,
    isVersionTagged,
    majorVersionsBehind: comparison.majorVersionsBehind,
    isMinorVersionBehindOnly: comparison.isMinorVersionBehindOnly,
    stalenessVoteCount,
  });

  await databases.updateDocument(db, answerCollection, answerId, {
    freshnessScore: result.freshnessScore,
    freshnessLabel: result.freshnessLabel,
    lastFreshnessCheck: new Date().toISOString(),
  });

  // Best-effort, non-blocking for the caller's result — the helper
  // swallows its own errors so a hiccup here never surfaces as a failure
  // of the freshness recompute the caller actually asked for.
  await recomputeQuestionFreshnessIndicator(answer.questionId as string | undefined);

  return { freshnessScore: result.freshnessScore, freshnessLabel: result.freshnessLabel };
}

function resolveEffectiveAge(createdAt: string, verifiedByAuthorAt: string | null): string {
  if (verifiedByAuthorAt) {
    const verifiedDaysAgo = (Date.now() - new Date(verifiedByAuthorAt).getTime()) / MS_PER_DAY;
    if (verifiedDaysAgo < AUTHOR_VERIFICATION_SUPPRESSION_DAYS) {
      return verifiedByAuthorAt;
    }
  }
  return createdAt;
}

function monthsSince(isoDate: string): number {
  const ms = Date.now() - new Date(isoDate).getTime();
  return ms / (30.44 * MS_PER_DAY);
}
