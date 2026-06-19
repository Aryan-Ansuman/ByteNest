/**
 * Sliding-window rate limiter backed by an in-process Map.
 *
 * Works correctly within a single Node.js process (dev, single-instance
 * serverless, long-running server). Across horizontally-scaled instances
 * you'd swap the store out for Redis — the interface stays the same.
 *
 * Usage:
 *   const result = rateLimit({ key: `vote:${userId}`, limit: 10, windowMs: 60_000 });
 *   if (!result.success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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

/** Map<key, sorted array of request timestamps (ms)> */
const store = new Map<string, number[]>();

export function rateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Retrieve and prune timestamps outside the current window.
    const timestamps = (store.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= limit) {
        // Oldest timestamp tells us when the first slot frees up.
        const resetAt = timestamps[0] + windowMs;
        return { success: false, remaining: 0, resetAt };
    }

    timestamps.push(now);
    store.set(key, timestamps);

    return {
        success: true,
        remaining: limit - timestamps.length,
        resetAt: now + windowMs,
    };
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
