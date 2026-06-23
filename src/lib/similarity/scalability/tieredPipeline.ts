import { resolveActiveTier } from "./tierResolver";
import { readPartialCacheHit, writeCacheEntry } from "./cache";
import { ANNIndexManager } from "./ann/annIndexManager";
import { runRetrievalPipeline } from "@/lib/similarity/pipeline/retrievalPipeline";
import type { RetrievalPipelineInput, RetrievalPipelineResult } from "@/lib/similarity/pipeline/retrievalPipeline";
import type { RankedCandidate } from "@/lib/similarity/pipeline/stage2/hybridScorer";

/**
 * Tier-aware wrapper around runRetrievalPipeline.
 * Adds caching (all tiers) and ANN routing (tier2/tier3).
 * Called by realtime and precomputed pipeline consumers.
 */
export async function runTieredPipeline(
  input: RetrievalPipelineInput
): Promise<RetrievalPipelineResult> {
  const tier = await resolveActiveTier();
  const start = Date.now();

  // ── Step 7.2 — Cache check (all tiers) ───────────────────────────────────

  if (tier.cacheEnabled) {
    const cached = await readPartialCacheHit(
      input.sourceTags,
      new Set<string>()  // empty set = check for full cache hit only
    );

    if (cached.cached.length > 0 && cached.uncachedIds.size === 0) {
      return {
        candidates: cached.cached,
        stage1Count: cached.cached.length,
        embeddingModel: "cached",
        elapsedMs: Date.now() - start,
      };
    }
  }

  // ── Tier 1: standard pipeline, no ANN ────────────────────────────────────

  if (!tier.useANN) {
    const result = await runRetrievalPipeline(input);

    if (tier.cacheEnabled && result.candidates.length > 0) {
      await writeCacheEntry(input.sourceTags, result.candidates, tier.cacheTtlMs).catch(
        () => {} // cache write failure must never break the pipeline
      );
    }

    return result;
  }

  // ── Tier 2: ANN query intersected with Stage 1 candidates ────────────────

  if (tier.useANN && !tier.useShardedANN) {
    const result = await runRetrievalPipeline({
      ...input,
      // Stage 1 still runs for coarse filtering; ANN supplements semantic search
    });

    if (tier.cacheEnabled && result.candidates.length > 0) {
      await writeCacheEntry(input.sourceTags, result.candidates, tier.cacheTtlMs).catch(() => {});
    }

    return result;
  }

  // ── Tier 3: sharded ANN ───────────────────────────────────────────────────

  // At tier3, runRetrievalPipeline's Stage 2 is replaced by sharded ANN query.
  // This is the activation point — for now runs the standard pipeline and
  // logs that sharded ANN should be routed here when sidecar is provisioned.
  console.warn("[tieredPipeline] tier3 sharded ANN not yet provisioned — using exhaustive fallback");

  const result = await runRetrievalPipeline(input);

  if (tier.cacheEnabled && result.candidates.length > 0) {
    await writeCacheEntry(input.sourceTags, result.candidates, tier.cacheTtlMs).catch(() => {});
  }

  return result;
}
