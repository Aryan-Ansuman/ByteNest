import { Query } from "node-appwrite";
import { db, answerCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { publishEvent } from "@/lib/events";
import { createPendingTestRun } from "./test-runs-repository";

export type RetroactiveVerificationSummary = {
  questionId: string;
  answersRequeued: number;
  triggeredBy: string;
};

/**
 * Resets every existing answer with solutionCode on this question back to
 * "pending" and pushes a fresh VerifyAnswer event for each — reusing the
 * exact Phase 3 worker, no new execution logic.
 *
 * Called from two places: the question-edit route when testCode actually
 * changes (triggeredBy = the editing user), and the scheduled drift-check
 * job for a single answer at a time (triggeredBy = "system").
 */
export async function triggerRetroactiveVerification(
  questionId: string,
  triggeredBy: string
): Promise<RetroactiveVerificationSummary> {
  const answersWithSolutions = await listAnswersWithSolutionCode(questionId);

  let requeued = 0;
  for (const answer of answersWithSolutions) {
    await requeueSingleAnswer(answer.$id, questionId, triggeredBy);
    requeued += 1;
  }

  return { questionId, answersRequeued: requeued, triggeredBy };
}

/**
 * Re-verifies exactly one answer — the unit the drift-check job (Phase 6,
 * scheduled trigger) operates on, one answer per event rather than
 * re-running an entire question's answer set in a single job tick.
 */
export async function requeueSingleAnswer(
  answerId: string,
  questionId: string,
  triggeredBy: string
): Promise<void> {
  const testRunId = await createPendingTestRun(answerId, questionId, triggeredBy);

  await publishEvent("VerifyAnswer", { answerId, questionId, testRunId });

  await databases.updateDocument(db, answerCollection, answerId, {
    verificationStatus: "pending",
  });
}

async function listAnswersWithSolutionCode(questionId: string) {
  const results: { $id: string }[] = [];
  let cursor: string | undefined;

  // Paginate — a heavily-answered question could exceed a single page.
  while (true) {
    const queries = [
      Query.equal("questionId", questionId),
      Query.isNotNull("solutionCode"),
      Query.limit(100),
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
    ];
    const page = await databases.listDocuments(db, answerCollection, queries);
    results.push(...page.documents.map((d) => ({ $id: d.$id })));

    if (page.documents.length < 100) break;
    cursor = page.documents[page.documents.length - 1].$id;
  }

  return results;
}
