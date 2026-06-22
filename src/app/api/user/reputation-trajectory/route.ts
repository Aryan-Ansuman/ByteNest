/**
 * GET /api/user/reputation-trajectory
 *
 * Returns the authenticated user's reputation trajectory computed from the
 * last 8 weeks of real (non-synthetic) reputation_events.
 *
 * Execution order (Step 5.2):
 *   1. Authenticate — extract userId from JWT (Step 5.1)
 *   2. Rate limit check (Step 5.5)
 *   3. Read current reputation from user prefs
 *   4. Query reputation_events for this userId (8 weeks, non-synthetic, ASC)
 *   5. Early-return noData if no real events
 *   6. Pass events to trajectory engine (Phase 4)
 *   7. Return shaped response (Step 5.3)
 */

import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases, users } from "@/models/server/config";
import { db } from "@/models/name";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
    computeReputationTrajectory,
    type ReputationEvent,
    type TrajectoryResult,
} from "@/lib/trajectory-engine";
import { readTrajectoryCache, writeTrajectoryCache } from "@/lib/trajectory-cache";
import type { UserPrefs } from "@/store/Auth";
import { detectConcurrentWriteSkew } from "@/lib/reputation-trajectory-hardening";

// ─── Step 5.4 — Never cache at CDN / Next.js layer ───────────────────────────

export const dynamic = "force-dynamic";

// ─── Constants ────────────────────────────────────────────────────────────────

const REPUTATION_EVENTS_COLLECTION = "reputation_events";

const RATE_LIMIT        = 30;
const RATE_WINDOW_MS    = 60_000; // 1 minute

const BUCKET_COUNT      = 8;
const MS_PER_WEEK       = 7 * 24 * 60 * 60 * 1000;
const QUERY_WINDOW_MS   = BUCKET_COUNT * MS_PER_WEEK;

// ─── Step 5.3 — Public response shape ────────────────────────────────────────

interface TrajectoryResponse extends TrajectoryResult {
    currentReputation: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Paginate through all events in the window (Appwrite max 100 per call). */
async function fetchReputationEvents(
    userId:      string,
    windowStart: string
): Promise<ReputationEvent[]> {
    const events: ReputationEvent[] = [];
    let cursor: string | undefined;

    for (;;) {
        const page = await databases.listDocuments(db, REPUTATION_EVENTS_COLLECTION, [
            Query.equal("userId", userId),
            Query.equal("isSynthetic", false),
            Query.greaterThanEqual("createdAt", windowStart),
            Query.orderAsc("createdAt"),
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);

        events.push(...(page.documents as unknown as ReputationEvent[]));

        if (page.documents.length < 100) break;
        cursor = page.documents[page.documents.length - 1].$id;
    }

    return events;
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    // ── Step 5.1 — Auth guard ─────────────────────────────────────────────────
    let userId: string;
    try {
        userId = await getAuthenticatedUserId();
    } catch {
        return unauthorizedResponse("Authentication required");
    }

    // ── Step 5.5 — Rate limit ─────────────────────────────────────────────────
    const rl = await rateLimit({
        key:      `rep-trajectory:${userId}`,
        limit:    RATE_LIMIT,
        windowMs: RATE_WINDOW_MS,
    });
    const rlHeaders = rateLimitHeaders(rl, RATE_LIMIT);

    if (!rl.success) {
        return NextResponse.json(
            { error: "Too many requests. Please slow down." },
            { status: 429, headers: rlHeaders }
        );
    }

    // ── Step 6.1 — Cache Read ─────────────────────────────────────────────────
    const cache = await readTrajectoryCache(userId);
    if (cache.hit) {
        return NextResponse.json(cache.payload.data, {
            status: 200,
            headers: { ...rlHeaders, "Cache-Control": "no-store" },
        });
    }

    try {
        // ── Step 5.2.1 — Current reputation from user prefs ───────────────────
        const user = await users.get<UserPrefs>(userId);
        const currentReputation = Number(user.prefs?.reputation ?? 0);

        // ── Step 5.2.2 — Query reputation_events (8-week window, non-synthetic)
        const windowStart = new Date(Date.now() - QUERY_WINDOW_MS).toISOString();
        const events = await fetchReputationEvents(userId, windowStart);

        // ── Step 5.2.3 — Early return when no real events exist ───────────────
        if (events.length === 0) {
            const emptyResult = computeReputationTrajectory([], currentReputation);
            const body: TrajectoryResponse = {
                currentReputation,
                ...emptyResult,
            };
            
            // ── Step 6.1 — Cache Write ────────────────────────────────────────
            await writeTrajectoryCache(userId, { data: body }).catch(console.error);

            return NextResponse.json(body, {
                status: 200,
                headers: { ...rlHeaders, "Cache-Control": "no-store" },
            });
        }

        // ── Step 5.2.4 — Compute trajectory (Phase 4 engine) ──────────────────
        const result = computeReputationTrajectory(events, currentReputation);
        const skewDetected = detectConcurrentWriteSkew(events);

        // ── Step 5.3 — Shape and return the response ──────────────────────────
        const body: TrajectoryResponse & { skewDetected?: boolean } = {
            currentReputation,
            ...result,
            ...(skewDetected ? { skewDetected: true } : {})
        };

        // ── Step 6.1 — Cache Write ────────────────────────────────────────────
        await writeTrajectoryCache(userId, { data: body }).catch(console.error);

        return NextResponse.json(body, {
            status: 200,
            headers: { ...rlHeaders, "Cache-Control": "no-store" },
        });
    } catch (error: any) {
        console.error("[/api/user/reputation-trajectory]", error?.message ?? error);
        return NextResponse.json(
            { error: error?.message ?? "Failed to load reputation trajectory" },
            { status: error?.status ?? error?.code ?? 500, headers: rlHeaders }
        );
    }
}
