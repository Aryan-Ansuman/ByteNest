import { Query } from "node-appwrite";
import { db, answerCollection, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";

/**
 * Recomputes questionCollection.hasVerifiedAnswer from the current answer
 * set. Called after every verification result (pass, fail, or error) — not
 * just on pass — so a question doesn't stay stuck "verified" after its one
 * passing answer later fails a retroactive re-check with no other passing
 * answer to fall back on.
 */
export async function syncQuestionVerifiedFlag(questionId: string): Promise<void> {
  const anyPassed = await databases.listDocuments(db, answerCollection, [
    Query.equal("questionId", questionId),
    Query.equal("verificationStatus", "passed"),
    Query.limit(1),
  ]);

  const hasVerifiedAnswer = anyPassed.documents.length > 0;

  const question = await databases.getDocument(db, questionCollection, questionId).catch(() => null);
  if (!question || question.hasVerifiedAnswer === hasVerifiedAnswer) return; // no-op, avoid a pointless write

  await databases.updateDocument(db, questionCollection, questionId, { hasVerifiedAnswer });
}
