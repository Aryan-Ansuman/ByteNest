import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { db, answerCollection, stalenessVotesCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { ApiValidationError, parseJsonBody, requireString } from "@/lib/api-validation";
import { getAuthenticatedUserId } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { withDistributedLock } from "@/lib/distributed-lock";
import { publishEvent } from "@/lib/events";
import { MIN_REPUTATION_FOR_STALENESS_VOTE } from "@/lib/decay/config";
import { createHash as nodeCreateHash } from "crypto";

const STALENESS_VOTE_RATE_LIMIT = 20;
const STALENESS_VOTE_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);
        const answerId = requireString(body.answerId, "answerId");
        const reportedVersion =
            typeof body.reportedVersion === "string" ? body.reportedVersion.trim().slice(0, 30) : undefined;

        const requesterId = await getAuthenticatedUserId();

        const rl = await rateLimit({
            key: `staleness-vote:${requesterId}`,
            limit: STALENESS_VOTE_RATE_LIMIT,
            windowMs: STALENESS_VOTE_WINDOW_MS,
        });
        const rlHeaders = rateLimitHeaders(rl, STALENESS_VOTE_RATE_LIMIT);
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many staleness reports. Please slow down." },
                { status: 429, headers: rlHeaders }
            );
        }

        const requester = await users.get(requesterId);
        const reputation = Number((requester.prefs as { reputation?: number })?.reputation ?? 0);
        if (reputation < MIN_REPUTATION_FOR_STALENESS_VOTE) {
            return NextResponse.json(
                { error: `You need at least ${MIN_REPUTATION_FOR_STALENESS_VOTE} reputation to report an answer as outdated.` },
                { status: 403, headers: rlHeaders }
            );
        }

        return await withDistributedLock(`staleness-vote:${answerId}:${requesterId}`, async () => {
            const answer = await databases.getDocument(db, answerCollection, answerId).catch(() => null);
            if (!answer) {
                return NextResponse.json(
                    { error: "The answer you're reporting no longer exists" },
                    { status: 404, headers: rlHeaders }
                );
            }

            if (answer.authorId === requesterId) {
                return NextResponse.json(
                    { error: "You can't report your own answer as outdated" },
                    { status: 403, headers: rlHeaders }
                );
            }

            const voteDocId = stalenessVoteDocumentId(answerId, requesterId);

            try {
                await databases.createDocument(db, stalenessVotesCollection, voteDocId, {
                    answerId,
                    userId: requesterId,
                    reportedVersion: reportedVersion ?? null,
                    createdAt: new Date().toISOString(),
                });
            } catch (error: any) {
                // 409 = the deterministic doc ID already exists — same
                // pattern as the vote API's own duplicate handling. Here it
                // means "already staleness-voted", which is a client error,
                // not a server error to retry.
                if (error?.code === 409) {
                    return NextResponse.json(
                        { error: "You've already reported this answer" },
                        { status: 409, headers: rlHeaders }
                    );
                }
                throw error;
            }

            const stalenessVoteCount = await recountStalenessVotes(answerId);
            await databases.updateDocument(db, answerCollection, answerId, { stalenessVoteCount });

            // Recompute immediately rather than waiting for the nightly job —
            // Decision 4. Never awaited into the response — the vote itself
            // already succeeded, and a slow/failed recompute shouldn't block
            // or fail the user-facing action.
            publishEvent("RecomputeFreshness", { answerId, triggeredAtMs: Date.now() }).catch((err) => {
                console.error(`[staleness-vote] Failed to publish recompute event for ${answerId}:`, err);
            });

            return NextResponse.json(
                { data: { answerId, stalenessVoteCount } },
                { status: 201, headers: rlHeaders }
            );
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error reporting answer as outdated" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);
        const answerId = requireString(body.answerId, "answerId");

        const requesterId = await getAuthenticatedUserId();

        const rl = await rateLimit({
            key: `staleness-vote:${requesterId}`,
            limit: STALENESS_VOTE_RATE_LIMIT,
            windowMs: STALENESS_VOTE_WINDOW_MS,
        });
        const rlHeaders = rateLimitHeaders(rl, STALENESS_VOTE_RATE_LIMIT);
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many actions. Please slow down." },
                { status: 429, headers: rlHeaders }
            );
        }

        return await withDistributedLock(`staleness-vote:${answerId}:${requesterId}`, async () => {
            const voteDocId = stalenessVoteDocumentId(answerId, requesterId);

            try {
                await databases.deleteDocument(db, stalenessVotesCollection, voteDocId);
            } catch (error: any) {
                if (error?.code === 404) {
                    return NextResponse.json(
                        { error: "You haven't reported this answer" },
                        { status: 404, headers: rlHeaders }
                    );
                }
                throw error;
            }

            const answerExists = await databases.getDocument(db, answerCollection, answerId).catch(() => null);
            if (!answerExists) {
                // Answer was deleted independently — the vote retraction above
                // already succeeded, nothing left to recompute.
                return NextResponse.json({ data: { answerId, stalenessVoteCount: 0 } }, { status: 200, headers: rlHeaders });
            }

            const stalenessVoteCount = await recountStalenessVotes(answerId);
            await databases.updateDocument(db, answerCollection, answerId, { stalenessVoteCount });

            publishEvent("RecomputeFreshness", { answerId, triggeredAtMs: Date.now() }).catch((err) => {
                console.error(`[staleness-vote] Failed to publish recompute event for ${answerId}:`, err);
            });

            return NextResponse.json(
                { data: { answerId, stalenessVoteCount } },
                { status: 200, headers: rlHeaders }
            );
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error retracting staleness report" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Deterministic doc ID from (answerId, userId) — same technique as the vote
 * API's voteDocumentId. Makes "already voted" a natural 409 on create
 * rather than a separate existence-check query, and doubles as the unique
 * index enforcement at the application layer even before Appwrite's own
 * unique index on (answerId, userId) would catch it.
 */
function stalenessVoteDocumentId(answerId: string, userId: string): string {
    return nodeCreateHash("sha256")
        .update(`staleness:${answerId}:${userId}`)
        .digest("hex")
        .slice(0, 32);
}

/**
 * Recomputes stalenessVoteCount by counting staleness_votes documents,
 * rather than a raw increment/decrement — same reasoning as the vote API's
 * adjustVoteCounter: counting from source avoids drift if a write is ever
 * retried or arrives out of order.
 */
async function recountStalenessVotes(answerId: string): Promise<number> {
    const result = await databases.listDocuments(db, stalenessVotesCollection, [
        Query.equal("answerId", answerId),
        Query.limit(1),
    ]);
    return result.total;
}
