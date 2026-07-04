/**
 * Code Smell Auto-Tagger — Phase 7.
 * Nightly aggregation of smell_feedback into a 7-day accuracy snapshot,
 * firing an alert when any smell's incorrect rate exceeds 40% over the window.
 *
 * Language segmentation note: smell_feedback rows don't store language
 * directly. Rather than re-fetching every referenced question's content to
 * re-derive it, language is read straight off the smell's own catalog
 * definition (SMELL_CATALOG[id].applicableTo) — most smells are already
 * language-specific by definition (e.g. "bare-except" is Python-only), so
 * this is exact for those. Smells with applicableTo: ["all"] are bucketed
 * under "generic" rather than attributed to whichever language the
 * offending question happened to use.
 *
 * appwrite.json wiring:
 * {
 *   "$id": "smell-accuracy-snapshot",
 *   "name": "Smell Accuracy Snapshot",
 *   "runtime": "node-18.0",
 *   "execute": ["any"],
 *   "events": [],
 *   "schedule": "0 3 * * *",
 *   "timeout": 300,
 *   "entrypoint": "src/main.js",
 *   "commands": "npm install",
 *   "path": "functions/smell-accuracy-snapshot"
 * }
 */

import { Query, ID, Models } from "node-appwrite";
import { db, smellAccuracySnapshotsCollection, smellFeedbackCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { listAllDocuments } from "@/lib/appwrite-pagination";
import { getSmellDefinition } from "./catalog";

const WINDOW_DAYS = 7;
const ALERT_THRESHOLD = 0.4; // 40% incorrect rate
const MIN_VOTES_FOR_ALERT = 5; // don't alert on a single unlucky vote pair

type SmellDoc = Models.Document & { smellId: string; verdict: "correct" | "incorrect" };

type SmellBreakdownEntry = {
  smellId: string;
  language: string;
  correct: number;
  incorrect: number;
  total: number;
  incorrectRate: number;
};

export type AccuracyJobSummary = {
  windowStart: string;
  windowEnd: string;
  totalFeedbackVotes: number;
  perSmellBreakdown: SmellBreakdownEntry[];
  alertFired: boolean;
  alertReasons: string[];
  durationMs: number;
};

export async function accuracyJobHandler({
  log,
  error,
}: {
  log: (msg: string) => void;
  error: (msg: string) => void;
}) {
  log("[smell-accuracy] Starting nightly accuracy aggregation…");
  try {
    const summary = await runAccuracyJob();
    log(
      `[smell-accuracy] Done — ${summary.totalFeedbackVotes} votes across ${summary.perSmellBreakdown.length} smells, ` +
      `alert: ${summary.alertFired}, duration: ${summary.durationMs}ms`
    );
    if (summary.alertFired) {
      log(`[smell-accuracy] ⚠️ ALERT — ${summary.alertReasons.join(" | ")}`);
    }
  } catch (err: any) {
    error(`[smell-accuracy] Job crashed: ${err?.message}`);
    throw err;
  }
}

export async function runAccuracyJob(): Promise<AccuracyJobSummary> {
  const startedAt = Date.now();
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const { documents: feedback } = await listAllDocuments<SmellDoc>(smellFeedbackCollection, [
    Query.greaterThanEqual("createdAt", windowStart.toISOString()),
    Query.select(["smellId", "verdict"]),
  ]);

  const tallies = new Map<string, { correct: number; incorrect: number }>();
  for (const row of feedback) {
    const entry = tallies.get(row.smellId) ?? { correct: 0, incorrect: 0 };
    if (row.verdict === "correct") entry.correct += 1;
    else entry.incorrect += 1;
    tallies.set(row.smellId, entry);
  }

  const perSmellBreakdown: SmellBreakdownEntry[] = [];
  const alertReasons: string[] = [];

  for (const [smellId, { correct, incorrect }] of Array.from(tallies.entries())) {
    const total = correct + incorrect;
    const incorrectRate = total > 0 ? incorrect / total : 0;
    const definition = getSmellDefinition(smellId);
    const language = languageLabel(definition?.applicableTo);

    perSmellBreakdown.push({ smellId, language, correct, incorrect, total, incorrectRate });

    if (total >= MIN_VOTES_FOR_ALERT && incorrectRate > ALERT_THRESHOLD) {
      alertReasons.push(
        `"${smellId}" (${language}) has a ${(incorrectRate * 100).toFixed(0)}% incorrect rate over the last ${WINDOW_DAYS} days (${incorrect}/${total} votes) — rule likely needs tightening.`
      );
    }
  }

  perSmellBreakdown.sort((a, b) => b.incorrectRate - a.incorrectRate);

  const summary: AccuracyJobSummary = {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    totalFeedbackVotes: feedback.length,
    perSmellBreakdown,
    alertFired: alertReasons.length > 0,
    alertReasons,
    durationMs: Date.now() - startedAt,
  };

  await writeSnapshot(summary);
  return summary;
}

function languageLabel(applicableTo: string[] | ["all"] | undefined): string {
  if (!applicableTo || applicableTo[0] === "all") return "generic";
  if (applicableTo.length === 1) return applicableTo[0];
  return applicableTo.join("/");
}

async function writeSnapshot(summary: AccuracyJobSummary): Promise<void> {
  await databases.createDocument(db, smellAccuracySnapshotsCollection, ID.unique(), {
    windowStart: summary.windowStart,
    windowEnd: summary.windowEnd,
    totalFeedbackVotes: summary.totalFeedbackVotes,
    perSmellBreakdown: JSON.stringify(summary.perSmellBreakdown).slice(0, 10000),
    alertFired: summary.alertFired,
    alertReasons: JSON.stringify(summary.alertReasons).slice(0, 5000),
    durationMs: summary.durationMs,
  });
}
