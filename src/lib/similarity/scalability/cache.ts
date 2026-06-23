import { databases } from "@/models/server/config";
import { Query, ID } from "node-appwrite";
import type { RankedCandidate } from "@/lib/similarity/pipeline/stage2/hybridScorer";

const DB = process.env.APPWRITE_DATABASE_ID || "main";
const CACHE_COL = process.env.APPWRITE_COLLECTION_SIMILARITY_CACHE || "similarity_cache";

/**
 * Step 7.2 — Stage 2 result cache.
 * Key: SHA-256 of sorted primary tags — 70–80% overlap for same-tag questions.
 * TTL: 24 hours. Partial cache hits served from cache; new candidates ranked fresh.
 *
 * Stored in Appwrite as a simple key-value collection.
 * At tier1 (100k questions) this is sufficient — no Redis needed.
 */

export type CacheEntry = {
  $id?: string;
  cacheKey: string;
  primaryTags: string;           // JSON — sorted tag array used to build cacheKey
  rankedCandidates: string;      // JSON — RankedCandidate[]
  expiresAt: string;             // ISO datetime
  createdAt: string;
};

// ─── Write ────────────────────────────────────────────────────────────────────

export async function writeCacheEntry(
  tags: string[],
  candidates: RankedCandidate[],
  ttlMs: number
): Promise<void> {
  const cacheKey = await buildCacheKey(tags);
  const now = new Date();
  const existing = await getCacheEntry(cacheKey);

  const payload = {
    cacheKey,
    primaryTags: JSON.stringify([...tags].sort()),
    rankedCandidates: JSON.stringify(candidates),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    createdAt: now.toISOString(),
  };

  if (existing?.$id) {
    await databases.updateDocument(DB, CACHE_COL, existing.$id, payload);
  } else {
    await databases.createDocument(DB, CACHE_COL, ID.unique(), payload);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function readCacheEntry(
  tags: string[]
): Promise<RankedCandidate[] | null> {
  const cacheKey = await buildCacheKey(tags);
  const entry = await getCacheEntry(cacheKey);

  if (!entry) return null;
  if (new Date(entry.expiresAt) < new Date()) return null; // expired

  return JSON.parse(entry.rankedCandidates) as RankedCandidate[];
}

/**
 * Partial cache hit: returns only the cached candidates whose questionIds
 * appear in the provided set. New candidates are ranked fresh and merged.
 */
export async function readPartialCacheHit(
  tags: string[],
  candidateIds: Set<string>
): Promise<{ cached: RankedCandidate[]; uncachedIds: Set<string> }> {
  const all = await readCacheEntry(tags);

  if (!all) return { cached: [], uncachedIds: candidateIds };

  const cached = all.filter((r) => candidateIds.has(r.questionId));
  const cachedIds = new Set(cached.map((r) => r.questionId));
  const uncachedIds = new Set([...candidateIds].filter((id) => !cachedIds.has(id)));

  return { cached, uncachedIds };
}

// ─── Sweep expired entries ────────────────────────────────────────────────────

export async function sweepExpiredCacheEntries(): Promise<number> {
  const now = new Date().toISOString();
  let cursor: string | undefined;
  let deleted = 0;

  do {
    const queries = [
      Query.lessThan("expiresAt", now),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments(DB, CACHE_COL, queries);
    if (res.documents.length === 0) break;

    await Promise.all(
      res.documents.map((doc) =>
        databases.deleteDocument(DB, CACHE_COL, doc.$id)
      )
    );

    deleted += res.documents.length;
    cursor = res.documents[res.documents.length - 1].$id;
  } while (true);

  return deleted;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function getCacheEntry(cacheKey: string): Promise<CacheEntry | null> {
  const res = await databases.listDocuments(DB, CACHE_COL, [
    Query.equal("cacheKey", cacheKey),
    Query.limit(1),
  ]);
  if (res.documents.length === 0) return null;
  return res.documents[0] as unknown as CacheEntry;
}

async function buildCacheKey(tags: string[]): Promise<string> {
  const sorted = [...tags].sort().join(",");
  const encoder = new TextEncoder();
  const data = encoder.encode(`tag_cache:${sorted}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
