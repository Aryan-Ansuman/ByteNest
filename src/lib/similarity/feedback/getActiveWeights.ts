import { databases } from "@/models/server/config";
import { db as DB, scoringWeightsCollection } from "@/models/name";
import { Query } from "node-appwrite";
import type { ScoringWeights } from "../pipeline/stage2/hybridScorer";

let _cache: (ScoringWeights & { threshold: number }) | null = null;
let _cacheTime = 0;
const TTL_MS = 0; // Disable cache for local dev

export async function getActiveWeights(): Promise<ScoringWeights & { threshold: number }> {
  if (_cache && Date.now() - _cacheTime < TTL_MS) return _cache;

  let docs;
  try {
    docs = await databases.listDocuments(
      DB,
      scoringWeightsCollection,
      [Query.orderDesc('version'), Query.limit(1)]
    );
  } catch (err) {
    // Collection might not exist yet, fallback to default
    return {
      semantic: 0.50,
      intent: 0.20,
      tag: 0.20,
      community: 0.10,
      threshold: 0.60,
    };
  }

  if (docs.documents.length === 0) {
    // Fallback if not seeded
    return {
      semantic: 0.50,
      intent: 0.20,
      tag: 0.20,
      community: 0.10,
      threshold: 0.60,
    };
  }

  const doc = docs.documents[0];
  _cache = {
    semantic: doc.wSemantic,
    intent: doc.wIntent,
    tag: doc.wTag,
    community: doc.wCommunity,
    threshold: doc.threshold,
  };
  _cacheTime = Date.now();
  return _cache;
}
