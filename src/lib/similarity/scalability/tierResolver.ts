import { databases } from "@/models/server/config";
import { Query } from "node-appwrite";
import type { ScaleTier, TierConfig } from "./types";
import { TIER_CONFIGS } from "./types";

const QUESTIONS_COL = process.env.APPWRITE_COLLECTION_QUESTIONS || "questions";
const DB = process.env.APPWRITE_DATABASE_ID || "main";

// Cache the resolved tier — re-resolve at most once per hour
let resolvedTier: ScaleTier | null = null;
let resolvedAt = 0;
const RESOLVE_TTL_MS = 60 * 60 * 1000;

/**
 * Step 7.1/7.3/7.5 — Resolves the active scale tier by counting questions.
 * Cached to avoid a count query on every pipeline invocation.
 */
export async function resolveActiveTier(): Promise<TierConfig> {
  if (resolvedTier && Date.now() - resolvedAt < RESOLVE_TTL_MS) {
    return TIER_CONFIGS[resolvedTier];
  }

  const count = await getQuestionCount();

  if (count >= 10_000_000) {
    resolvedTier = "tier3_10m";
  } else if (count >= 1_000_000) {
    resolvedTier = "tier2_1m";
  } else {
    resolvedTier = "tier1_100k";
  }

  resolvedAt = Date.now();
  return TIER_CONFIGS[resolvedTier];
}

async function getQuestionCount(): Promise<number> {
  // Appwrite returns total in the listDocuments response
  const res = await databases.listDocuments(DB, QUESTIONS_COL, [Query.limit(1)]);
  return res.total;
}

/** Force tier override — used in tests and local dev */
export function forceActiveTier(tier: ScaleTier): void {
  resolvedTier = tier;
  resolvedAt = Date.now();
}
