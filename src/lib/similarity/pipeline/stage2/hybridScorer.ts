import { scoreCommunity, getMaxVotes } from "./communityScorer";
import { jaccardSimilarity } from "./tagScorer";
import { scoreIntents, classifySourceIntent } from "./intentScorer";
import { batchCosineSimilarity } from "./cosineSimilarity";
import { getRecencyMultiplier } from "./recencyMultiplier";
import { getBatchByQuestionIds } from "@/lib/similarity/data/embeddingRepository";
import type { TagFilterCandidate } from "../stage1/tagFilter";
import type { CandidateIntentContext } from "./intentScorer";

import { getActiveWeights } from "../../feedback/getActiveWeights";

export type ScoringWeights = {
  semantic: number;   // w_s
  intent: number;     // w_i
  tag: number;        // w_t
  community: number;  // w_c
};

// We leave these here for reference, but active weights are fetched at query time
export const DEFAULT_WEIGHTS: ScoringWeights = {
  semantic: 0.50,
  intent: 0.20,
  tag: 0.20,
  community: 0.10,
};

export const MINIMUM_HYBRID_THRESHOLD = 0.65; // recalibrated by Phase 9

// ─── Ranked candidate ─────────────────────────────────────────────────────────

export type RankedCandidate = {
  questionId: string;
  hybridScore: number;
  semanticScore: number;
  tagOverlapScore: number;
  intentMatchScore: number | null;
  communityScore: number;
  recencyMultiplier: number;
  tags: string[];
  hasAcceptedAnswer: boolean;
  createdAt: string;
};

// ─── Main scorer ──────────────────────────────────────────────────────────────

export async function runStage2(params: {
  sourceVector: number[];
  sourceTitle: string;
  sourceTags: string[];
  candidates: TagFilterCandidate[];
  intentContexts: Map<string, CandidateIntentContext>;
  weights?: ScoringWeights;
  threshold?: number;
}): Promise<RankedCandidate[]> {
  const {
    sourceVector,
    sourceTitle,
    sourceTags,
    candidates,
    intentContexts,
  } = params;

  // Step 8.3 — Use active weights at query time
  const activeConfig = await getActiveWeights();
  const weights = params.weights ?? activeConfig;
  const threshold = params.threshold ?? activeConfig.threshold;

  if (candidates.length === 0) return [];

  // Step 6.7 — Source intent classification (done once for the batch)
  const sourceIntent = classifySourceIntent(sourceTitle);

  // Step 6.8 — Retrieve candidate embeddings
  const questionIds = candidates.map((c) => c.questionId);
  const embeddingRecords = await getBatchByQuestionIds(questionIds);

  // Build lookup: questionId → vector
  const vectorMap = new Map<string, number[]>();
  for (const rec of embeddingRecords) {
    vectorMap.set(rec.questionId, rec.embeddingVector);
  }

  // Step 6.8 — Batch cosine similarity (source vs all candidates with embeddings)
  // For local development without API keys, we inject mock vectors for missing embeddings
  const noOpenAiKey = !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'sk-...';
  const noCohereKey = !process.env.COHERE_API_KEY || process.env.COHERE_API_KEY === '...';
  const isMock = noOpenAiKey && noCohereKey;
  const mockVector = new Array(1536).fill(0.1);

  const candidatesWithVectors = isMock ? candidates : candidates.filter((c) =>
    vectorMap.has(c.questionId)
  );
  
  const candidateVectors = candidatesWithVectors.map(
    (c) => vectorMap.get(c.questionId) || mockVector
  );
  const semanticScores = batchCosineSimilarity(sourceVector, candidateVectors);

  // Step 6.11 — Community scorer requires maxVotes across the full batch
  const maxVotes = getMaxVotes(
    candidatesWithVectors.map((c) => ({
      voteCount: c.voteCount,
      hasAcceptedAnswer: c.hasAcceptedAnswer,
    }))
  );

  // ─── Score each candidate ─────────────────────────────────────────────────

  const ranked: RankedCandidate[] = [];

  for (let i = 0; i < candidatesWithVectors.length; i++) {
    const candidate = candidatesWithVectors[i];
    const semanticScore = Math.max(0, semanticScores[i]); // clamp to [0,1]

    // Step 6.9 — Intent similarity
    const intentContext = intentContexts.get(candidate.questionId);
    const intentMatchScore = intentContext
      ? scoreIntents(sourceIntent, intentContext)
      : null;

    // Step 6.10 — Tag Jaccard
    const tagOverlapScore = jaccardSimilarity(sourceTags, candidate.tags);

    // Step 6.11 — Community engagement
    const communityScore = scoreCommunity(
      { voteCount: candidate.voteCount, hasAcceptedAnswer: candidate.hasAcceptedAnswer },
      maxVotes
    );

    // Step 6.12 — Hybrid formula
    // intent excluded from formula when null (uncertain)
    let hybridScore: number;

    if (intentMatchScore !== null) {
      hybridScore =
        semanticScore  * weights.semantic  +
        intentMatchScore * weights.intent  +
        tagOverlapScore  * weights.tag     +
        communityScore   * weights.community;
    } else {
      // Redistribute intent weight proportionally across remaining signals
      const total = weights.semantic + weights.tag + weights.community;
      hybridScore =
        semanticScore  * (weights.semantic  / total) +
        tagOverlapScore  * (weights.tag       / total) +
        communityScore   * (weights.community  / total);
    }

    // Step 6.13 — Recency multiplier (applied after hybrid score)
    const recencyMultiplier = getRecencyMultiplier(
      candidate.createdAt,
      candidate.hasAcceptedAnswer
    );
    hybridScore = parseFloat((hybridScore * recencyMultiplier).toFixed(4));

    ranked.push({
      questionId: candidate.questionId,
      hybridScore,
      semanticScore,
      tagOverlapScore,
      intentMatchScore,
      communityScore,
      recencyMultiplier,
      tags: candidate.tags,
      hasAcceptedAnswer: candidate.hasAcceptedAnswer,
      createdAt: candidate.createdAt,
    });
  }

  // Step 6.14 — Filter by threshold, sort descending, return top 3
  const finalRanked = ranked
    .filter((r) => r.hybridScore >= threshold)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, 3);
    
  // Return all ranked for debugging if consumer is test
  if (candidates.length > 0 && finalRanked.length === 0) {
    console.log("[Stage2 Debug] candidates dropped. Raw scores:", JSON.stringify(ranked));
  }

  return finalRanked;
}
