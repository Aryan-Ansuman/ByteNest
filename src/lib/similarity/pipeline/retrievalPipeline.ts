import { assembleStage1Candidates } from "./stage1/candidateAssembler";
import { runStage2 } from "./stage2/hybridScorer";
import { generateEmbedding } from "@/lib/similarity/nlp/embeddingClient";
import { buildEmbeddingInput } from "@/lib/similarity/nlp/buildEmbeddingInput";
import { getNode } from "@/lib/graph/nodeRepository";
import { upsertCandidate } from "@/lib/similarity/data/candidateRepository";
import type { ScoringWeights } from "./stage2/hybridScorer";
import type { CandidateIntentContext } from "./stage2/intentScorer";
import type { RankedCandidate } from "./stage2/hybridScorer";

export type RetrievalPipelineInput = {
  sourceTitle: string;
  sourceBody: string;
  sourceTags: string[];
  sourceQuestionId?: string;
  weights?: ScoringWeights;
  threshold?: number;
  persist?: boolean; // write results to similarity_candidates
};

export type RetrievalPipelineResult = {
  candidates: RankedCandidate[];
  stage1Count: number;
  embeddingModel: string;
  elapsedMs: number;
};

/**
 * Full two-stage retrieval pipeline — Steps 6.1–6.14.
 * Called by:
 *   - realtime pipeline (Consumer 1, draft flow)
 *   - precomputed pipeline (Consumer 2, post-creation indexing)
 */
export async function runRetrievalPipeline(
  input: RetrievalPipelineInput
): Promise<RetrievalPipelineResult> {
  const start = Date.now();

  const {
    sourceTitle,
    sourceBody,
    sourceTags,
    sourceQuestionId,
    weights,
    threshold,
    persist = false,
  } = input;

  // ── Stage 1 ───────────────────────────────────────────────────────────────

  const stage1 = await assembleStage1Candidates({
    sourceTags,
    sourceTitle,
    sourceBody,
    sourceQuestionId,
  });

  if (stage1.candidates.length === 0) {
    return { candidates: [], stage1Count: 0, embeddingModel: "", elapsedMs: Date.now() - start };
  }

  // ── Step 6.7 — On-demand source embedding ────────────────────────────────

  const { embeddingInput } = await buildEmbeddingInput({
    title: sourceTitle,
    body: sourceBody,
    tags: sourceTags,
  });

  const embeddingResult = await generateEmbedding(embeddingInput);

  // ── Step 6.9 — Load intent contexts from graph nodes ────────────────────

  const intentContexts = new Map<string, CandidateIntentContext>();

  await Promise.all(
    stage1.candidates.map(async (c) => {
      const node = await getNode("question", c.questionId);
      if (!node) return;

      const attrs = node.attrs as {
        intentLabel?: string;
        intentConfidence?: number;
      };

      if (attrs.intentLabel) {
        intentContexts.set(c.questionId, {
          questionId: c.questionId,
          intentLabel: attrs.intentLabel,
          intentConfidence: attrs.intentConfidence ?? 0,
        });
      }
    })
  );

  // ── Stage 2 ───────────────────────────────────────────────────────────────

  const ranked = await runStage2({
    sourceVector: embeddingResult.vector,
    sourceTitle,
    sourceTags,
    candidates: stage1.candidates,
    intentContexts,
    weights,
    threshold,
  });

  // ── Persist to similarity_candidates if requested ─────────────────────────

  if (persist && sourceQuestionId && ranked.length > 0) {
    await Promise.all(
      ranked.map((r) =>
        upsertCandidate({
          questionId: sourceQuestionId,
          candidateId: r.questionId,
          hybridScore: r.hybridScore,
          semanticScore: r.semanticScore,
          tagOverlapScore: r.tagOverlapScore,
          intentMatchScore: r.intentMatchScore,
          communityScore: r.communityScore,
          explanationTokens: [],  // Phase 7 fills this
          detectionMethod: "embedding_search",
          status: "suggested",
        })
      )
    );
  }

  return {
    candidates: ranked,
    stage1Count: stage1.finalCount,
    embeddingModel: embeddingResult.model,
    elapsedMs: Date.now() - start,
  };
}
