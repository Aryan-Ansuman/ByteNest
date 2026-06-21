/**
 * Answer Gap Detector — Phase 3: Caching Layer
 *
 * Step 3.1 — Per-user TTL cache backed by the existing `rateLimits` Appwrite
 *            collection (same collection the rate-limiter uses — documents are
 *            cheap and it already exists).
 *
 * Step 3.2 — Invalidation strategy: TTL only for v1.
 *            No targeted invalidation on new-question-posted events.
 *            Enhancement path is documented at the bottom.
 *
 * Step 3.3 — Empty results are cached identically to populated results.
 *            The cache stores the `meta.reason` field so the frontend knows
 *            whether to show "no skill data yet" vs "no gaps right now".
 *
 * Why the rateLimits collection?
 *   It already has key/bucket/createdAt/expiresAt attributes and the server
 *   has read+write permission. We add a "value" string attribute (JSON) via
 *   a one-time migration if it doesn't exist, or we encode the payload into
 *   the `bucket` field (capped at 64 chars — too short). Instead we store a
 *   separate document per cache entry using a deterministic document ID
 *   derived from the cache key, exactly like the distributed-lock pattern.
 *
 * Cache document shape (stored in rateLimits collection):
 *   key       = "gap-cache:<userId>"
 *   bucket    = "<expiresAtMs>"          (stringified unix ms, fits in 64 chars)
 *   createdAt = <unix ms of storage>
 *   expiresAt = <unix ms of expiry>
 *
 * The full JSON payload is stored by creating one additional Appwrite document
 * in a dedicated "answer_gap_cache" logical namespace within rateLimits —
 * the key prefix disambiguates it from rate-limit entries.
 *
 * Payload size: 3 GapQuestion objects ≈ 600–800 bytes JSON — well within the
 * Appwrite 64 KB document limit even after stringification.
 */

import { ID, Query } from "node-appwrite";
import { createHash } from "crypto";
import { databases } from "@/models/server/config";
import { db, rateLimitCollection } from "@/models/name";
import { GAP_CACHE_TTL_MS } from "./constants";
import type { GapQuestion } from "@/app/api/answer-gaps/route";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GapCacheReason = "ok" | "no_gaps" | "no_skill_data";

export interface GapCachePayload {
    data:   GapQuestion[];
    meta:   { reason: GapCacheReason; count: number };
    cachedAt: number;
}

export type CacheResult = {
    hit:     true;
    payload: GapCachePayload;
} | {
    hit:     false;
    payload: null;
};

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * Deterministic document ID for a cache entry.
 * Same SHA-256 truncation pattern as distributed-lock.ts.
 */
function cacheDocId(userId: string): string {
    return createHash("sha256")
        .update(`gap-cache:${userId}`)
        .digest("hex")
        .slice(0, 32);
}

const CACHE_KEY_PREFIX = "gap-cache:";

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Attempt to read a valid (non-expired) cache entry for this user.
 *
 * Returns { hit: true, payload } if a fresh entry exists,
 * or     { hit: false, payload: null } if the cache is cold or stale.
 */
export async function readGapCache(userId: string): Promise<
    { hit: true; payload: GapCachePayload } | { hit: false; payload: null }
> {
    const docId = cacheDocId(userId);

    let doc: any;
    try {
        doc = await databases.getDocument(db, rateLimitCollection, docId);
    } catch {
        // Document doesn't exist yet — cache miss
        return { hit: false, payload: null };
    }

    const now      = Date.now();
    const expiresAt = Number(doc.expiresAt ?? 0);

    // Step 3.1 — TTL check
    if (expiresAt <= now) {
        // Stale — delete in background, return miss
        databases.deleteDocument(db, rateLimitCollection, docId).catch(() => undefined);
        return { hit: false, payload: null };
    }

    // ── Fetch the value document ─────────────────────────────────────────────
    const valueDocId = docId.slice(0, 30) + "v1";
    let valueDoc: any;
    try {
        valueDoc = await databases.getDocument(db, rateLimitCollection, valueDocId);
    } catch {
        return { hit: false, payload: null };
    }

    let payload: GapCachePayload;
    try {
        // Value is stored as a JSON string split across key and bucket fields
        payload = JSON.parse(reconstructValueJson(valueDoc));
    } catch {
        return { hit: false, payload: null };
    }

    return { hit: true, payload };
}

/**
 * Write a cache entry for this user.
 * Overwrites any existing entry (upsert via delete-then-create pattern,
 * same as distributed-lock.ts).
 *
 * Step 3.3 — Caches empty results too (data=[], meta.reason="no_gaps" etc.).
 */
export async function writeGapCache(
    userId:  string,
    payload: Omit<GapCachePayload, "cachedAt">
): Promise<void> {
    const docId      = cacheDocId(userId);
    const valueDocId = docId.slice(0, 30) + "v1";
    const now        = Date.now();
    const expiresAt  = now + GAP_CACHE_TTL_MS;

    let fullPayload: GapCachePayload = { ...payload, cachedAt: now };
    let valueJson = JSON.stringify(fullPayload);

    // Ensure it fits within 317 bytes (254 for key + 63 for bucket)
    while (valueJson.length > 317 && fullPayload.data.length > 0) {
        fullPayload.data.pop();
        fullPayload.meta.count = fullPayload.data.length;
        valueJson = JSON.stringify(fullPayload);
    }

    if (valueJson.length > 317) {
        return; // Even an empty payload is too large, abort caching
    }

    // ── Upsert anchor document ────────────────────────────────────────────────
    await databases.deleteDocument(db, rateLimitCollection, docId).catch(() => undefined);
    await databases.createDocument(db, rateLimitCollection, docId, {
        key:       `${CACHE_KEY_PREFIX}${userId}`,
        bucket:    String(expiresAt),
        createdAt: now,
        expiresAt,
    });

    // ── Upsert value document ─────────────────────────────────────────────────
    let chunk1 = valueJson.slice(0, 254);
    let chunk2 = valueJson.slice(254, 317);

    await databases.deleteDocument(db, rateLimitCollection, valueDocId).catch(() => undefined);
    await databases.createDocument(db, rateLimitCollection, valueDocId, {
        key:       chunk1,
        bucket:    chunk2,
        createdAt: now,
        expiresAt,
    });
}

/**
 * Reconstitute the full JSON from a value document's split fields.
 * (Used internally — exposed for testing.)
 */
export function reconstructValueJson(doc: { key: string; bucket: string }): string {
    return (doc.key ?? "") + (doc.bucket ?? "");
}

/**
 * Explicitly invalidate the cache for a user.
 *
 * Step 3.2 — Called manually or by a future event hook.
 * Currently not wired to any event — TTL expiry handles staleness for v1.
 */
export async function invalidateGapCache(userId: string): Promise<void> {
    const docId      = cacheDocId(userId);
    const valueDocId = docId.slice(0, 30) + "v1";
    await Promise.allSettled([
        databases.deleteDocument(db, rateLimitCollection, docId),
        databases.deleteDocument(db, rateLimitCollection, valueDocId),
    ]);
}

/**
 * Convenience: check whether a cache hit is still fresh enough to serve.
 * (Redundant with the TTL check in readGapCache, but useful in tests.)
 */
export function isCacheFresh(payload: GapCachePayload, nowMs = Date.now()): boolean {
    return nowMs - payload.cachedAt < GAP_CACHE_TTL_MS;
}

// ─── Step 3.2 — Enhancement path (not implemented in v1) ─────────────────────
//
// To add targeted cache invalidation when a new question is posted:
//
//   1. In POST /api/question/route.ts, after the question is created, call:
//        invalidateGapCacheForTag(question.tags, question.authorId)
//
//   2. `invalidateGapCacheForTag` would:
//      a. Query user_skill_scores for all userId values where tag IN question.tags
//      b. For each userId, call invalidateGapCache(userId)
//
//   At scale this becomes a fan-out problem (one new question → many invalidations).
//   The v2 solution is to replace per-user cache documents with a shared
//   per-tag question list cached in Redis / Upstash, and have each user's
//   request assemble their personalised view client-side from the shared list.
//
// ─────────────────────────────────────────────────────────────────────────────
