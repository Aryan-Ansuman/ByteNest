import type { ANNIndex, ANNQueryResult, ShardKey } from "./annTypes";
import { batchCosineSimilarity } from "@/lib/similarity/pipeline/stage2/cosineSimilarity";

/**
 * Tier 1 ANN implementation: exhaustive cosine similarity.
 * No external dependency — correct by definition, fast enough at ≤100k questions.
 * Replaced at tier2 by a FAISS sidecar client (see ExternalANNClient below).
 */
export class ExhaustiveANNIndex implements ANNIndex {
  private vectors: Map<string, number[]> = new Map();

  async query(queryVector: number[], k: number): Promise<ANNQueryResult[]> {
    if (this.vectors.size === 0) return [];

    const ids = Array.from(this.vectors.keys());
    const vecs = ids.map((id) => this.vectors.get(id)!);
    const scores = batchCosineSimilarity(queryVector, vecs);

    return ids
      .map((id, i) => ({ questionId: id, approximateScore: Math.max(0, scores[i]) }))
      .sort((a, b) => b.approximateScore - a.approximateScore)
      .slice(0, k);
  }

  async add(questionId: string, vector: number[]): Promise<void> {
    this.vectors.set(questionId, vector);
  }

  async size(): Promise<number> {
    return this.vectors.size;
  }
}

/**
 * Tier 2/3 ANN implementation: thin HTTP client to a FAISS Python sidecar.
 *
 * The sidecar is a FastAPI service (analogous to the ML service in the
 * AI Interview Assistant project) that:
 *   - Loads FAISS IndexFlatIP on startup
 *   - Exposes POST /query, POST /add, POST /merge, GET /size
 *   - Handles nightly primary ← secondary merge internally
 *
 * This client does not implement FAISS directly — FAISS requires native
 * binaries not available in a Node.js process. The sidecar pattern keeps
 * the Node pipeline clean and the FAISS dependency isolated.
 */
export class ExternalANNClient implements ANNIndex {
  constructor(
    private readonly baseUrl: string, // e.g. process.env.ANN_SIDECAR_URL
    private readonly shardKey?: ShardKey
  ) {}

  async query(queryVector: number[], k: number): Promise<ANNQueryResult[]> {
    const res = await fetch(`${this.baseUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector: queryVector,
        k,
        shard: this.shardKey ?? null,
      }),
    });

    if (!res.ok) {
      throw new Error(`ANN sidecar query failed: ${res.status}`);
    }

    const json = await res.json();
    return json.results as ANNQueryResult[];
  }

  async add(questionId: string, vector: number[]): Promise<void> {
    await fetch(`${this.baseUrl}/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, vector, shard: this.shardKey ?? null }),
    });
  }

  async size(): Promise<number> {
    const res = await fetch(
      `${this.baseUrl}/size${this.shardKey ? `?shard=${this.shardKey}` : ""}`
    );
    const json = await res.json();
    return json.size as number;
  }
}
