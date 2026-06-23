/**
 * ANN interface definitions.
 * The concrete implementation (FAISS via Python sidecar, or a JS approximation)
 * is injected at runtime — the pipeline only depends on this interface.
 *
 * At tier1 (100k): ANN is not used — exhaustive cosine in Stage 2 is fast enough.
 * At tier2 (1M):   Single primary + secondary index, nightly merge.
 * At tier3 (10M):  Sharded by primary tag cluster, queries route to relevant shards.
 */

export interface ANNIndex {
  /**
   * Query the index for the k approximate nearest neighbors of the query vector.
   * Returns results sorted by similarity descending.
   */
  query(queryVector: number[], k: number): Promise<ANNQueryResult[]>;

  /** Add a single vector to the index (secondary index append). */
  add(questionId: string, vector: number[]): Promise<void>;

  /** Returns the number of vectors currently in this index. */
  size(): Promise<number>;
}

export type ANNQueryResult = {
  questionId: string;
  approximateScore: number; // cosine similarity approximation [0, 1]
};

export type ShardKey = string; // primary tag name, e.g. "javascript", "python"
