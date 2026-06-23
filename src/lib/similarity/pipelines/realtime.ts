import type { SimilarityRequest, SimilarityResult } from "../types";
import type { ConsumerConfig } from "../types";
import { runRetrievalPipeline } from "../pipeline/retrievalPipeline";
import { generateExplanationTokens } from "../pipeline/stage2/explanationTokens";

export async function runRealtimePipeline(
  req: SimilarityRequest,
  consumer: ConsumerConfig
): Promise<SimilarityResult> {
  const start = Date.now();

  const result = await runRetrievalPipeline({
    sourceTitle: req.draftTitle ?? "",
    sourceBody: req.draftBody ?? "",
    sourceTags: req.draftTags ?? [],
    persist: false, // draft flow — do not persist until question is posted
  });

  const elapsed = Date.now() - start;
  if (elapsed > consumer.latencyBudgetMs) {
    console.warn(
      `[similarity] realtime pipeline exceeded budget: ${elapsed}ms > ${consumer.latencyBudgetMs}ms`
    );
  }

  // Phase 8: Hydrate titles for UI
  const { databases } = await import("@/models/server/config");
  const { questionCollection, db } = await import("@/models/name");
  const { Query } = await import("node-appwrite");

  const candidateIds = result.candidates.map(r => r.questionId);
  const titlesMap = new Map<string, string>();

  if (candidateIds.length > 0) {
    const docs = await databases.listDocuments(db, questionCollection, [
      Query.equal("$id", candidateIds),
      Query.select(["$id", "title"])
    ]);
    for (const doc of docs.documents) {
      titlesMap.set(doc.$id, doc.title);
    }
  }

  return {
    consumerId: consumer.id,
    candidates: result.candidates.map((r) => {
      const explanationTokens = generateExplanationTokens(
        {
          semantic: r.semanticScore,
          tagJaccard: r.tagOverlapScore,
          intentMatch: r.intentMatchScore !== null && r.intentMatchScore > 0,
          intentConfidence: 0.8, // simplified for now
        },
        r
      );
      const title = titlesMap.get(r.questionId) || "Untitled Question";
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      
      return {
        candidateId: r.questionId, // Updated from questionId
        title,
        hybridScore: r.hybridScore,
        explanationTokens,
        url: `/questions/${r.questionId}/${slug}`,
        scores: {
          semantic: r.semanticScore,
          intent: r.intentMatchScore,
          tag: r.tagOverlapScore,
          community: r.communityScore,
          hybrid: r.hybridScore,
        }
      };
    }),
    computedAt: new Date(),
    servedFromCache: false,
  };
}
