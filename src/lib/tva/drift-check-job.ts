/**
 * Scheduled drift-check job.
 *
 * Appwrite Function handler wired to a schedule trigger (e.g. "0 5 * /3 * *"
 * — every 3 days). Also exported as a standalone async function for CLI use.
 * Same shape as registry-rebuild-job.ts.
 *
 * Catches the case an edit-triggered re-verification (Phase 6, primary
 * trigger) can miss: test suites whose Piston runtime environment or
 * pinned "latest" version drifted, or an edit that happened before this
 * feature existed. Re-runs currently-"passed" answers only — "failed" and
 * "error" answers are left alone, since a human already has an actionable
 * signal for those and re-running them on a timer adds queue load without
 * new information.
 */

import { Query } from "node-appwrite";
import { db, answerCollection, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { requeueSingleAnswer } from "./trigger-retroactive-verification";

const BATCH_SIZE = 50;
const INTER_ANSWER_DELAY_MS = 200; // spread Piston load rather than bursting

export type DriftCheckSummary = {
  answersChecked: number;
  answersRequeued: number;
  failed: number;
  durationMs: number;
};

export async function driftCheckJobHandler({
  log,
  error,
}: {
  log: (msg: string) => void;
  error: (msg: string) => void;
}) {
  log("[tva-drift-check] Starting scheduled drift check…");

  try {
    const summary = await runDriftCheck({
      onAnswerRequeued: (answerId) => log(`[tva-drift-check] Requeued answer ${answerId}`),
      onAnswerError: (answerId, err: any) =>
        error(`[tva-drift-check] Failed to requeue answer ${answerId}: ${err?.message}`),
    });

    log(
      `[tva-drift-check] Done — checked: ${summary.answersChecked}, ` +
      `requeued: ${summary.answersRequeued}, failed: ${summary.failed}, ` +
      `duration: ${summary.durationMs}ms`
    );
  } catch (err: any) {
    error(`[tva-drift-check] Job crashed: ${err?.message}`);
    throw err;
  }
}

export async function runDriftCheck(options?: {
  onAnswerRequeued?: (answerId: string) => void;
  onAnswerError?: (answerId: string, err: unknown) => void;
}): Promise<DriftCheckSummary> {
  const startedAt = Date.now();
  let answersChecked = 0;
  let answersRequeued = 0;
  let failed = 0;

  const passedAnswers = await databases.listDocuments(db, answerCollection, [
    Query.equal("verificationStatus", "passed"),
    Query.isNotNull("solutionCode"),
    Query.limit(BATCH_SIZE),
    // Oldest lastVerifiedAt first — spreads coverage across the whole
    // "passed" set over successive runs rather than always hitting the
    // newest answers.
    Query.orderAsc("lastVerifiedAt"),
  ]);

  for (const answer of passedAnswers.documents) {
    answersChecked += 1;

    const question = await databases
      .getDocument(db, questionCollection, answer.questionId as string)
      .catch(() => null);

    // Question's test suite was removed entirely since this answer passed —
    // nothing to drift-check against.
    if (!question?.hasTestSuite || !question.testCode) continue;

    try {
      await requeueSingleAnswer(answer.$id, question.$id, "system");
      answersRequeued += 1;
      options?.onAnswerRequeued?.(answer.$id);
    } catch (err) {
      failed += 1;
      options?.onAnswerError?.(answer.$id, err);
    }

    await new Promise((resolve) => setTimeout(resolve, INTER_ANSWER_DELAY_MS));
  }

  return {
    answersChecked,
    answersRequeued,
    failed,
    durationMs: Date.now() - startedAt,
  };
}
