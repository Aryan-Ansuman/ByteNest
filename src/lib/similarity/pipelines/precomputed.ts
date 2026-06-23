import type { SimilarityRequest, SimilarityResult, ConsumerConfig } from "../types";
import { getRelatedQuestions } from "@/lib/similarity/data/candidateRepository";

export async function runPrecomputedLookup(
  req: SimilarityRequest,
  consumer: ConsumerConfig
): Promise<SimilarityResult> {
  if (!req.questionId) throw new Error("precomputed pipeline requires questionId");

  const stored = await getRelatedQuestions(req.questionId, 5);

  return {
    consumerId: consumer.id,
    candidates: stored.map((c) => ({
      questionId: c.candidateId,
      title: "",
      hybridScore: c.hybridScore,
      explanationTokens: c.explanationTokens,
      url: `/questions/${c.candidateId}`,
    })),
    computedAt: new Date(),
    servedFromCache: true,
  };
}
