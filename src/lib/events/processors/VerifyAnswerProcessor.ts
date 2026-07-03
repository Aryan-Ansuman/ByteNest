import type { VerifyAnswerPayload } from "../types";
import { db, answerCollection, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { buildExecutionPlan } from "@/lib/tva/build-execution-plan";
import { executePiston } from "@/lib/tva/piston-client";
import { parseVerificationScore } from "@/lib/tva/parse-test-score";
import { markTestRunProcessing, completeTestRun, failTestRun } from "@/lib/tva/test-runs-repository";
import { revalidateQuestionCaches } from "@/lib/cache-invalidation";
import { PISTON_MAX_RETRIES } from "@/lib/tva/config";
import { PistonExecutionError, UnsupportedFrameworkError } from "@/lib/tva/types";
import { syncQuestionVerifiedFlag } from "@/lib/tva/sync-question-verified-flag";

/**
 * Step 5.1-equivalent for TVA — VerifyAnswer processor.
 *
 * `retryCount` is the queue document's current retry count, threaded in by
 * the dispatcher (see dispatcher.ts route()). It's how this processor tells
 * "infra failure, worth retrying" from "infra failure, give up" apart —
 * something the generic event_queue retry mechanism has no opinion about.
 *
 * Throwing from this function tells the dispatcher to requeue (markFailed →
 * pending, retryCount+1). Returning normally — even for a FAILING test
 * result — tells it the event is done (markComplete). A failing test is a
 * successful execution; only Piston infra errors are queue-level failures.
 */
export async function processVerifyAnswer(
  payload: VerifyAnswerPayload,
  retryCount = 0
): Promise<void> {
  const { answerId, questionId, testRunId } = payload;

  const [answer, question] = await Promise.all([
    databases.getDocument(db, answerCollection, answerId).catch(() => null),
    databases.getDocument(db, questionCollection, questionId).catch(() => null),
  ]);

  // Answer or question deleted between enqueue and processing — nothing to
  // verify. Not an error condition, just a no-op.
  if (!answer || !question || !question.hasTestSuite || !answer.solutionCode) {
    if (testRunId) await failTestRun(testRunId, "Answer or question no longer eligible for verification");
    return;
  }

  if (testRunId) await markTestRunProcessing(testRunId);

  let plan;
  try {
    plan = buildExecutionPlan(
      question.testFramework,
      answer.solutionCode as string,
      question.testCode as string
    );
  } catch (err) {
    // Unsupported framework is a permanent, non-retryable condition —
    // distinct from a Piston infra failure.
    const message = err instanceof UnsupportedFrameworkError ? err.message : "Failed to build execution plan";
    if (testRunId) await failTestRun(testRunId, message);
    await databases.updateDocument(db, answerCollection, answerId, {
      verificationStatus: "error",
    });
    await syncQuestionVerifiedFlag(questionId);
    return;
  }

  const startedAt = Date.now();

  try {
    const result = await executePiston(plan);
    const durationMs = Date.now() - startedAt;

    if (testRunId) {
      await completeTestRun(testRunId, {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        durationMs,
        pistonRuntime: result.runtime,
      });
    }

    const verificationStatus = result.exitCode === 0 ? "passed" : "failed";
    const verificationScore = parseVerificationScore(
      question.testFramework,
      result.stdout,
      result.exitCode
    );

    await databases.updateDocument(db, answerCollection, answerId, {
      verificationStatus,
      verificationScore,
      lastVerifiedAt: new Date().toISOString(),
    });

    await syncQuestionVerifiedFlag(questionId);
    await revalidateQuestionCaches(questionId, [question.title as string]);
  } catch (err) {
    const isPistonInfraFailure = err instanceof PistonExecutionError;
    const message = err instanceof Error ? err.message : String(err);

    const exhausted = retryCount >= PISTON_MAX_RETRIES;

    if (testRunId) await failTestRun(testRunId, message);

    if (!isPistonInfraFailure || exhausted) {
      // Either a bug in our own code (not a Piston issue, retrying won't
      // help) or retries are exhausted — settle on "error", distinct from
      // "failed", since we never actually determined correctness.
      await databases.updateDocument(db, answerCollection, answerId, {
        verificationStatus: "error",
      });
      await syncQuestionVerifiedFlag(questionId);
      await revalidateQuestionCaches(questionId, [question.title as string]);
      return; // swallow — do not requeue further
    }

    // Still have retries left on a genuine Piston infra failure — rethrow so
    // the dispatcher requeues via markFailed (status -> pending, retryCount+1).
    // verificationStatus stays "pending" (already set when queued), so the
    // UI keeps showing "Verifying…" through the retry.
    throw err;
  }
}
