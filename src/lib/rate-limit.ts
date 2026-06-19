import { ID, Query } from "node-appwrite";
import { db, rateLimitCollection } from "@/models/name";
import { databases } from "@/models/server/config";

/**
 * Fixed-window rate limiter backed by Appwrite documents.
 *
 * Each request creates one short-lived event document, then counts events in
 * the current window. Because the store is Appwrite, separate serverless
 * instances share the same counters instead of relying on process memory.
 */

interface RateLimitOptions {
    /** Unique key identifying this counter bucket (e.g. `"vote:userId123"`). */
    key: string;
    /** Maximum number of requests allowed in the window. */
    limit: number;
    /** Window size in milliseconds. */
    windowMs: number;
}

interface RateLimitResult {
    success: boolean;
    /** Remaining requests in the current window. */
    remaining: number;
    /** When the window resets (Unix ms timestamp). */
    resetAt: number;
}

export async function rateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
    const now = Date.now();
    const bucketStart = Math.floor(now / windowMs) * windowMs;
    const bucket = String(bucketStart);
    const resetAt = bucketStart + windowMs;
    let currentDocumentId: string | null = null;

    try {
        const created = await databases.createDocument(db, rateLimitCollection, ID.unique(), {
            key,
            bucket,
            createdAt: now,
            expiresAt: resetAt,
        });
        currentDocumentId = created.$id;

        const count = await databases.listDocuments(db, rateLimitCollection, [
            Query.equal("key", key),
            Query.equal("bucket", bucket),
            Query.limit(1),
        ]);

        cleanupExpiredRateLimitEvents(now).catch(() => undefined);

        if (count.total > limit) {
            await databases
                .deleteDocument(db, rateLimitCollection, currentDocumentId)
                .catch(() => undefined);
            return { success: false, remaining: 0, resetAt };
        }

        return {
            success: true,
            remaining: Math.max(limit - count.total, 0),
            resetAt,
        };
    } catch (error) {
        console.error("[rate-limit] persistent limiter failed", error);
        return { success: false, remaining: 0, resetAt };
    }
}

async function cleanupExpiredRateLimitEvents(now: number) {
    const expired = await databases.listDocuments(db, rateLimitCollection, [
        Query.lessThan("expiresAt", now),
        Query.limit(50),
    ]);

    await Promise.allSettled(
        expired.documents.map((doc) =>
            databases.deleteDocument(db, rateLimitCollection, doc.$id)
        )
    );
}

/**
 * Convenience: build a NextResponse-ready header object from a RateLimitResult.
 *
 *   const rl = rateLimit({ key, limit: 5, windowMs: 60_000 });
 *   const headers = rateLimitHeaders(rl, 5);
 *   if (!rl.success) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
 */
export function rateLimitHeaders(
    result: RateLimitResult,
    limit: number
): Record<string, string> {
    return {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        ...(result.success ? {} : { "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)) }),
    };
}
