import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases, users } from "@/models/server/config";
import { db, discussionRoomsCollection, roomMessagesCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";
import { postSystemMessage } from "@/lib/rooms/server";
import { writeReputationEvent } from "@/lib/write-reputation-event";

const MIN_ROOT_CAUSE_LENGTH = 20;
// Cap on unique helpers who get the "socratic_question_asked" reputation
// event, ordered by their first question's timestamp (Phase 0, Decision 10).
const MAX_REWARDED_HELPERS = 3;

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;

        // Validation (Phase 8, step 1: "validate seeker identity") — room
        // exists, a session is active, caller is the seeker, root cause has
        // substance. All of this must pass before anything is written.
        let room;
        try {
            room = await databases.getDocument(db, discussionRoomsCollection, roomId);
        } catch {
            return NextResponse.json({ error: "Room not found" }, { status: 404 });
        }

        if (room.socraticMode !== true) {
            return NextResponse.json({ error: "No active Socratic session." }, { status: 400 });
        }

        if (userId !== room.socraticSeekerId) {
            return NextResponse.json(
                { error: "Only the seeker can submit the root cause." },
                { status: 403 }
            );
        }

        const { rootCause } = await req.json();
        const trimmed = typeof rootCause === "string" ? rootCause.trim() : "";

        if (trimmed.length < MIN_ROOT_CAUSE_LENGTH) {
            return NextResponse.json(
                { error: `Root cause must be at least ${MIN_ROOT_CAUSE_LENGTH} characters.` },
                { status: 400 }
            );
        }

        // Step 2: best-effort save of the root cause as an answer on the
        // linked question. This goes through the full existing answer
        // pipeline (sanitization, metadata sync, skill recalculation, etc.)
        // via an internal call. A failed/errored save does not abort
        // teardown — the root cause is preserved in the room's chat history
        // either way (see the system message below) — but it does run
        // *before* the system message and room update, per the required
        // ordering.
        let savedAnswerId: string | null = null;

        if (room.linkedQuestionId) {
            try {
                const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
                const answerRes = await fetch(`${req.nextUrl.origin}/api/answer`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(authHeader ? { Authorization: authHeader } : {}),
                    },
                    body: JSON.stringify({
                        questionId: room.linkedQuestionId,
                        answer: `**Root cause found in a Socratic debugging session.** ${trimmed}`,
                        authorId: userId,
                    }),
                });

                if (answerRes.ok) {
                    const answerData = await answerRes.json();
                    savedAnswerId = answerData?.$id ?? answerData?.response?.$id ?? null;
                } else {
                    console.error(
                        `root-cause: answer API returned ${answerRes.status} for room ${roomId}`
                    );
                }
            } catch (err) {
                console.error(`root-cause: failed to save answer for room ${roomId}`, err);
            }
        }

        // Step 3: post the session-end system message, its content depending
        // on the outcome of step 2.
        await postSystemMessage(
            roomId,
            savedAnswerId
                ? `✅ Root cause saved as an answer to: '${room.linkedQuestionTitle ?? "the linked question"}'`
                : room.linkedQuestionId
                    ? "Root cause recorded in room (saving it as an answer failed — the question link may be stale)."
                    : `💡 Root cause recorded: ${trimmed.slice(0, 100)}${trimmed.length > 100 ? "…" : ""}`
        );

        // Step 4: clear Socratic mode on the room — fires Realtime,
        // propagating to every connected client.
        await databases.updateDocument(db, discussionRoomsCollection, roomId, {
            socraticMode: false,
            socraticSeekerId: null,
            socraticStartedAt: null,
        });

        // Reputation (Phase 9) — fire-and-forget, deliberately *after* the
        // required 1→2→3→4 sequence above so it can never delay or reorder
        // teardown. Logged and swallowed on failure.
        awardSocraticReputation({
            roomId,
            seekerId: userId,
            socraticStartedAt: room.socraticStartedAt,
            rootCauseAnswerId: savedAnswerId,
        }).catch((err) => console.error(`root-cause: reputation award failed for room ${roomId}`, err));

        // Respond
        return NextResponse.json({ ok: true, answerId: savedAnswerId });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error submitting root cause" },
            { status: error?.status || 500 }
        );
    }
}

/**
 * Awards a +delta reputation bump to one user, following the same
 * read-modify-write pattern used elsewhere (see api/adr/route.ts): read
 * current reputation from user prefs, compute the new total, persist it,
 * then log the event with that resulting total. Non-fatal on failure —
 * logged and swallowed by the caller.
 */
async function awardReputation(args: {
    userId: string;
    delta: number;
    eventType: "socratic_question_asked" | "socratic_session_completed";
    sourceId: string;
    sourceType: "answer" | "room";
}) {
    const { userId, delta, eventType, sourceId, sourceType } = args;
    const prefs = await users.getPrefs(userId);
    const currentRep = Number((prefs as any).reputation ?? 0);
    const nextRep = currentRep + delta;
    await users.updatePrefs(userId, { ...prefs, reputation: nextRep });

    await writeReputationEvent({
        userId,
        delta,
        eventType,
        reputationAfter: nextRep,
        sourceId,
        sourceType,
    });
}

/**
 * Writes reputation events for the completed Socratic session:
 *  - +5 for the seeker (socratic_session_completed), sourceId points at the
 *    saved answer if one exists, otherwise the room itself.
 *  - +2 each for up to the first 3 unique helpers who asked a question
 *    during the session (socratic_question_asked), ordered by their first
 *    question's timestamp.
 *
 * Each award is a read-modify-write on that user's prefs, so awards run
 * sequentially per user but independent users can't race each other here
 * since this function only ever runs once per session (Phase 0, Decision 10:
 * the event fires at session end, not per message).
 */
async function awardSocraticReputation(args: {
    roomId: string;
    seekerId: string;
    socraticStartedAt: string | null;
    rootCauseAnswerId: string | null;
}) {
    const { roomId, seekerId, socraticStartedAt, rootCauseAnswerId } = args;

    await awardReputation({
        userId: seekerId,
        delta: 5,
        eventType: "socratic_session_completed",
        sourceId: rootCauseAnswerId ?? roomId,
        sourceType: rootCauseAnswerId ? "answer" : "room",
    });

    if (!socraticStartedAt) return;

    const questionMessages = await databases.listDocuments(db, roomMessagesCollection, [
        Query.equal("roomId", roomId),
        Query.equal("type", "question"),
        Query.greaterThanEqual("$createdAt", socraticStartedAt),
        Query.orderAsc("$createdAt"),
        Query.limit(200),
    ]);

    const rewardedHelpers: string[] = [];
    for (const msg of questionMessages.documents) {
        const authorId = msg.authorId as string;
        if (rewardedHelpers.includes(authorId)) continue;
        rewardedHelpers.push(authorId);
        if (rewardedHelpers.length >= MAX_REWARDED_HELPERS) break;
    }

    for (const helperId of rewardedHelpers) {
        await awardReputation({
            userId: helperId,
            delta: 2,
            eventType: "socratic_question_asked",
            sourceId: roomId,
            sourceType: "room",
        });
    }
}
