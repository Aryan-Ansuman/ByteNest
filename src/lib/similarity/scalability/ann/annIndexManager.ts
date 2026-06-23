import { databases } from "@/models/server/config";
import { Query, ID } from "node-appwrite";
import type { ANNIndex, ANNQueryResult, ShardKey } from "./annTypes";
import { ExhaustiveANNIndex, ExternalANNClient } from "./annClient";
import type { ScaleTier } from "../types";
import type { ANNIndexMeta } from "../types";

const DB = process.env.APPWRITE_DATABASE_ID || "main";
const ANN_META_COL = process.env.APPWRITE_COLLECTION_ANN_INDEX_META || "ann_index_meta";
const ANN_SIDECAR_URL = process.env.ANN_SIDECAR_URL ?? "";

/**
 * Step 7.3/7.4/7.5 — ANN index manager.
 *
 * Tier 1: Returns an ExhaustiveANNIndex (no-op — pipeline uses direct cosine).
 * Tier 2: Returns primary + secondary ExternalANNClient pair.
 *         queryWithMerge() searches both, merges, deduplicates.
 * Tier 3: Returns a sharded set of ExternalANNClients.
 *         queryShards() routes to relevant shards by tag, merges results.
 */
export class ANNIndexManager {
  private tier: ScaleTier;

  constructor(tier: ScaleTier) {
    this.tier = tier;
  }

  // ── Tier 1 ────────────────────────────────────────────────────────────────

  /** Returns the exhaustive index for tier1 — used only for interface compatibility. */
  getTier1Index(): ANNIndex {
    return new ExhaustiveANNIndex();
  }

  // ── Tier 2 ────────────────────────────────────────────────────────────────

  /**
   * Step 7.3 — Queries both primary and secondary ANN indexes, merges results.
   * Primary: all embeddings up to last nightly merge.
   * Secondary: embeddings added since last merge.
   */
  async queryWithMerge(
    queryVector: number[],
    k: number
  ): Promise<ANNQueryResult[]> {
    const primary = new ExternalANNClient(`${ANN_SIDECAR_URL}/primary`);
    const secondary = new ExternalANNClient(`${ANN_SIDECAR_URL}/secondary`);

    const [primaryResults, secondaryResults] = await Promise.all([
      primary.query(queryVector, k),
      secondary.query(queryVector, k),
    ]);

    return mergeAndDedup([...primaryResults, ...secondaryResults], k);
  }

  /**
   * Step 7.4 — Appends a new embedding to the secondary index.
   * Called by EmbeddingGenerated processor.
   * Secondary is merged into primary nightly (via the merge job).
   */
  async appendToSecondary(
    questionId: string,
    vector: number[]
  ): Promise<void> {
    const secondary = new ExternalANNClient(`${ANN_SIDECAR_URL}/secondary`);
    await secondary.add(questionId, vector);
  }

  // ── Tier 3 ────────────────────────────────────────────────────────────────

  /**
   * Step 7.5 — Routes query to relevant shards by source tags, merges results.
   * Each shard covers a primary tag cluster (e.g. "javascript", "python").
   */
  async queryShards(
    queryVector: number[],
    sourceTags: string[],
    k: number
  ): Promise<ANNQueryResult[]> {
    const shardKeys = await resolveShardKeys(sourceTags);

    const shardResults = await Promise.all(
      shardKeys.map((shardKey) => {
        const client = new ExternalANNClient(
          `${ANN_SIDECAR_URL}/shard`,
          shardKey
        );
        return client.query(queryVector, k);
      })
    );

    return mergeAndDedup(shardResults.flat(), k);
  }

  // ── ANN index metadata (stored in Appwrite) ───────────────────────────────

  async getIndexMeta(indexId: string): Promise<ANNIndexMeta | null> {
    const res = await databases.listDocuments(DB, ANN_META_COL, [
      Query.equal("indexId", indexId),
      Query.limit(1),
    ]);
    if (res.documents.length === 0) return null;
    return res.documents[0] as unknown as ANNIndexMeta;
  }

  async upsertIndexMeta(meta: Omit<ANNIndexMeta, "$id">): Promise<void> {
    const existing = await this.getIndexMeta(meta.indexId);
    if (existing?.$id) {
      await databases.updateDocument(DB, ANN_META_COL, existing.$id, meta);
    } else {
      await databases.createDocument(DB, ANN_META_COL, ID.unique(), meta);
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mergeAndDedup(results: ANNQueryResult[], k: number): ANNQueryResult[] {
  const seen = new Map<string, number>();

  for (const r of results) {
    const existing = seen.get(r.questionId);
    // Keep the higher score if seen in multiple shards/indexes
    if (existing === undefined || r.approximateScore > existing) {
      seen.set(r.questionId, r.approximateScore);
    }
  }

  return Array.from(seen.entries())
    .map(([questionId, approximateScore]) => ({ questionId, approximateScore }))
    .sort((a, b) => b.approximateScore - a.approximateScore)
    .slice(0, k);
}

/**
 * Step 7.5 — Maps source tags to their shard keys.
 * A shard key is the canonical primary tag for a technology cluster.
 * e.g. ["react", "react-hooks"] both map to shard "javascript"
 *
 * In production this mapping lives in a shard_config collection in Appwrite.
 * For now: shard key = first tag (simple approximation until shard config exists).
 */
async function resolveShardKeys(tags: string[]): Promise<ShardKey[]> {
  if (tags.length === 0) return ["default"];
  // Deduplicate shard keys — multiple tags may map to the same shard
  return [...new Set(tags.slice(0, 2))]; // query at most 2 shards per request
}
