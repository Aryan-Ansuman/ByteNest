import { db, questionCollection, answerCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { publishEvent } from "@/lib/events";
import { createPendingTestRun } from "./test-runs-repository";

/**
 * Called synchronously from the answer POST route, after the answer document
 * is created — NOT fire-and-forget like triggerSkillRecalculation, because
 * the route needs verificationStatus: "pending" on the response so the UI
 * can render "Verifying…" immediately. The actual Piston call happens later,
 * out of band, when /api/events/poll picks up the queued event.
 *
 * Returns "pending" if verification was queued, or null if this question has
 * no test suite / answer has no solutionCode — caller treats null as
 * "leave verificationStatus unverified".
 */
export async function triggerVerification(options: {
  answerId: string;
  questionId: string;
  solutionCode: string | null | undefined;
  triggeredBy: string;
}): Promise<"pending" | null> {
  const { answerId, questionId, solutionCode, triggeredBy } = options;

  if (!solutionCode || solutionCode.trim().length === 0) return null;

  const question = await databases
    .getDocument(db, questionCollection, questionId, [])
    .catch(() => null);

  if (!question?.hasTestSuite || !question.testCode || !question.testFramework) {
    return null;
  }

  const testRunId = await createPendingTestRun(answerId, questionId, triggeredBy);

  await publishEvent("VerifyAnswer", { answerId, questionId, testRunId });

  await databases.updateDocument(db, answerCollection, answerId, {
    verificationStatus: "pending",
  });

  return "pending";
}

export class RetryNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryNotAllowedError";
  }
}

/**
 * Manual retry — the "Retry" affordance on a verificationStatus: "error"
 * badge (Phase 4). Distinct from Phase 6's retroactive re-verification:
 * this is a single answer, user-triggered, and only valid from "error" —
 * retrying a "failed" result through this path would blur the line between
 * "the code is wrong" and "we couldn't tell", which Phase 0 deliberately
 * kept separate.
 */
export async function retryVerification(
  answerId: string,
  triggeredBy: string
): Promise<void> {
  const answer = await databases.getDocument(db, answerCollection, answerId).catch(() => null);
  if (!answer) throw new RetryNotAllowedError("Answer not found");
  if (answer.verificationStatus !== "error") {
    throw new RetryNotAllowedError(
      `Retry is only available from the "error" state (current: ${answer.verificationStatus})`
    );
  }

  const question = await databases
    .getDocument(db, questionCollection, answer.questionId as string)
    .catch(() => null);
  if (!question?.hasTestSuite || !question.testCode || !question.testFramework) {
    throw new RetryNotAllowedError("Question no longer has an active test suite");
  }
  if (!answer.solutionCode) {
    throw new RetryNotAllowedError("Answer no longer has solution code");
  }

  const testRunId = await createPendingTestRun(answerId, question.$id, triggeredBy);

  await publishEvent("VerifyAnswer", {
    answerId,
    questionId: question.$id,
    testRunId,
  });

  await databases.updateDocument(db, answerCollection, answerId, {
    verificationStatus: "pending",
  });
}
