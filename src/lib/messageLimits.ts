import { rateLimit } from "@/lib/rate-limit";

/**
 * Global rate limit: max 100 messages per minute per user, across ALL rooms.
 * Call this at the top of PATCH /api/rooms/[id]/messages, BEFORE slow-mode checks.
 *
 * The key is user-scoped (not room-scoped) so spamming multiple rooms
 * simultaneously is also caught.
 */
export async function checkGlobalMessageLimit(
    userId: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
    const result = await rateLimit({
        key: `global-msg:${userId}`,
        limit: 100,
        windowMs: 60_000,
    });
    return {
        allowed: result.success,
        retryAfter: result.success
            ? undefined
            : Math.ceil((result.resetAt - Date.now()) / 1000),
    };
}
