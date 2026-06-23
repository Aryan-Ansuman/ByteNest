export type ScaleTier = "tier1_100k" | "tier2_1m" | "tier3_10m";

export type TierConfig = {
  tier: ScaleTier;
  questionCountThreshold: number;
  latencyBudgetMs: number;
  stage1MaxCandidates: number;
  useANN: boolean;
  useShardedANN: boolean;
  useBlobEmbeddingStorage: boolean;
  cacheEnabled: boolean;
  cacheTtlMs: number;
};

export const TIER_CONFIGS: Record<ScaleTier, TierConfig> = {
  tier1_100k: {
    tier: "tier1_100k",
    questionCountThreshold: 100_000,
    latencyBudgetMs: 300,
    stage1MaxCandidates: 150,
    useANN: false,
    useShardedANN: false,
    useBlobEmbeddingStorage: false,
    cacheEnabled: true,
    cacheTtlMs: 24 * 60 * 60 * 1000,     // 24 hours
  },
  tier2_1m: {
    tier: "tier2_1m",
    questionCountThreshold: 1_000_000,
    latencyBudgetMs: 500,
    stage1MaxCandidates: 500,             // higher — ANN will reduce, not exhaustive scan
    useANN: true,
    useShardedANN: false,
    useBlobEmbeddingStorage: false,
    cacheEnabled: true,
    cacheTtlMs: 24 * 60 * 60 * 1000,
  },
  tier3_10m: {
    tier: "tier3_10m",
    questionCountThreshold: 10_000_000,
    latencyBudgetMs: 800,
    stage1MaxCandidates: 1000,
    useANN: true,
    useShardedANN: true,
    useBlobEmbeddingStorage: true,
    cacheEnabled: true,
    cacheTtlMs: 24 * 60 * 60 * 1000,
  },
} as const;

// ANN index document stored in Appwrite (metadata only — vectors in memory/blob)
export type ANNIndexMeta = {
  $id?: string;
  indexId: string;           // "primary" | "secondary" | shard key e.g. "javascript"
  indexType: "primary" | "secondary" | "shard";
  shardTag: string | null;   // only set for tier3 shards
  vectorCount: number;
  dimensions: number;
  lastBuiltAt: string;
  lastMergedAt: string | null;
  embeddingModel: string;
  embeddingVersion: number;
};

// Result of an ANN nearest-neighbor query
export type ANNQueryResult = {
  questionId: string;
  approximateDistance: number; // lower = more similar (L2) or higher = more similar (IP)
};
