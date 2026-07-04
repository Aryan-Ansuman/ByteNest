import { Query } from "node-appwrite";
import { db, questionCollection, smellFeedbackCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import type { SmellFeedbackSummary, SmellFeedbackTally } from "./types";

export type ApplyFeedbackResult = {
  tally: SmellFeedbackTally;
  autoRemoved: boolean;
};

/**
 * Recounts a single smell's tally from source (same "count, don't
 * increment" reasoning as recountStalenessVotes in the decay system —
 * avoids drift from retried/out-of-order writes), applies the auto-removal
 * threshold, and persists both smellFeedbackSummary and (if triggered) the
 * updated systemTags in one updateDocument call.
 */
export async function applyFeedbackToQuestion(
  questionId: string,
  smellId: string
): Promise<ApplyFeedbackResult> {
  const [correct, incorrect] = await Promise.all([
    countVerdicts(questionId, smellId, "correct"),
    countVerdicts(questionId, smellId, "incorrect"),
  ]);

  // Auto-removal threshold: incorrect >= 3 AND incorrect > correct * 2.
  const autoRemoved = incorrect >= 3 && incorrect > correct * 2;
  const tally: SmellFeedbackTally = { correct, incorrect, ...(autoRemoved ? { autoRemoved: true } : {}) };

  const question = await databases.getDocument(db, questionCollection, questionId);
  const summary: SmellFeedbackSummary = safeParseSummary(question.smellFeedbackSummary as string | null);
  summary[smellId] = tally;

  const patch: Record<string, unknown> = {
    smellFeedbackSummary: JSON.stringify(summary).slice(0, 2000),
  };

  if (autoRemoved) {
    const currentTags: string[] = Array.isArray(question.systemTags) ? question.systemTags : [];
    if (currentTags.includes(smellId)) {
      patch.systemTags = currentTags.filter((tag) => tag !== smellId);
    }
  }

  await databases.updateDocument(db, questionCollection, questionId, patch);

  return { tally, autoRemoved };
}

async function countVerdicts(questionId: string, smellId: string, verdict: "correct" | "incorrect"): Promise<number> {
  const result = await databases.listDocuments(db, smellFeedbackCollection, [
    Query.equal("questionId", questionId),
    Query.equal("smellId", smellId),
    Query.equal("verdict", verdict),
    Query.limit(1),
  ]);
  return result.total;
}

function safeParseSummary(raw: string | null): SmellFeedbackSummary {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
