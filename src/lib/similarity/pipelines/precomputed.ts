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
      candidateId: c.candidateId,
      title: "",
      hybridScore: c.hybridScore,
      explanationTokens: c.explanationTokens,
      url: `/questions/${c.candidateId}`,
      scores: {
        semantic: c.semanticScore,
        intent: c.intentMatchScore,
        tag: c.tagOverlapScore,
        community: c.communityScore,
        hybrid: c.hybridScore,
      }
    })),
    computedAt: new Date(),
    servedFromCache: true,
  };
}
