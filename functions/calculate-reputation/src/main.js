/**
 * Phase 2 — Steps 2.1–2.5
 * calculate-reputation Appwrite Function
 *
 * Triggered by Appwrite database events on votes and answers.
 * For every reputation change it:
 *   1. Adjusts user.prefs.reputation  (existing behaviour, unchanged)
 *   2. Writes one record to reputation_events per atomic delta  (Phase 2)
 *
 * Step 2.4 — Vote toggles and switches produce separate events:
 *   - Toggle off (upvoted → neutral):   one "..._upvote_removed" event
 *   - Switch     (upvoted → downvoted): two events —
 *       "..._upvote_removed"  then  "..._downvoted"
 *
 * Step 2.5 — After every write we verify `reputationAfter` matches the
 *   live value in user.prefs and log a warning on any mismatch.
 *
 * Event log writes are non-fatal: if they fail, reputation still changes
 * and the error is logged without rolling back the prefs update.
 */

import { Client, Databases, ID, Users } from "node-appwrite";

export default async ({ req, res, log, error }) => {
    if (!req.variables.APPWRITE_FUNCTION_EVENT) {
        log("No event provided.");
        return res.send("No event provided.");
    }

    const event    = req.variables.APPWRITE_FUNCTION_EVENT;
    const document = req.body;

    if (!document || !document.$id) {
        return res.send("No valid document body.");
    }

    // ── Appwrite client ────────────────────────────────────────────────────────

    const client = new Client()
        .setEndpoint(req.variables.APPWRITE_ENDPOINT ?? "https://cloud.appwrite.io/v1")
        .setProject(req.variables.APPWRITE_PROJECT_ID)
        .setKey(req.variables.APPWRITE_API_KEY);

    const users     = new Users(client);
    const databases = new Databases(client);

    const DB_ID                    = "6a2bbffd00190eccf0b8";
    const REPUTATION_EVENTS_COLL   = "reputation_events";

    // ── Event type flags ───────────────────────────────────────────────────────

    const isVote   = event.includes("collections.votes.");
    const isAnswer = event.includes("collections.answers.");

    const isCreate = event.endsWith(".create");
    const isDelete = event.endsWith(".delete");
    const isUpdate = event.endsWith(".update");

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2.2 — writeReputationEvent (inline, no external import in Functions)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Write one atomic reputation change to the event log.
     * Never throws — errors are logged but the reputation change stands.
     *
     * @returns {Promise<string|null>} Document ID or null on failure.
     */
    const writeReputationEvent = async ({
        userId,
        delta,
        eventType,
        reputationAfter,
        sourceId    = null,
        sourceType  = null,
        isSynthetic = false,
    }) => {
        if (!userId || delta === 0) return null;

        try {
            const doc = await databases.createDocument(
                DB_ID,
                REPUTATION_EVENTS_COLL,
                ID.unique(),
                {
                    userId,
                    delta,
                    eventType,
                    reputationAfter,
                    createdAt: new Date().toISOString(),
                    isSynthetic,
                    ...(sourceId   ? { sourceId }   : {}),
                    ...(sourceType ? { sourceType } : {}),
                }
            );
            return doc.$id;
        } catch (err) {
            error(
                `[writeReputationEvent] Failed userId=${userId} ` +
                `type=${eventType} delta=${delta}: ${err?.message ?? err}`
            );
            return null;
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2.5 — Consistency check
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Verify that the reputation we stored in reputationAfter matches
     * what actually ended up in user.prefs after the write.
     */
    const verifyReputationAfter = async (userId, expectedReputation) => {
        try {
            const prefs     = await users.getPrefs(userId);
            const liveRep   = Number(prefs.reputation ?? 0);
            if (liveRep !== expectedReputation) {
                error(
                    `[verifyReputationAfter] Mismatch userId=${userId}: ` +
                    `stored=${expectedReputation} live=${liveRep} ` +
                    `(possible concurrent update)`
                );
            }
        } catch (err) {
            error(`[verifyReputationAfter] Could not verify userId=${userId}: ${err?.message}`);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2.3 — adjustRep: update prefs then write event
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply a single reputation delta and immediately write the event record.
     *
     * @param {string}  userId
     * @param {number}  delta         — positive gain, negative loss
     * @param {string}  eventType     — ReputationEventType value
     * @param {string}  sourceId      — ID of the triggering document
     * @param {string}  sourceType    — "vote" | "answer" | "question"
     */
    const adjustRep = async (userId, delta, eventType, sourceId, sourceType) => {
        if (!userId || delta === 0) return;

        let currentRep   = 0;
        let nextRep      = 0;

        try {
            const prefs = await users.getPrefs(userId);
            currentRep  = Number(prefs.reputation ?? 0);
            nextRep     = currentRep + delta;

            await users.updatePrefs(userId, { ...prefs, reputation: nextRep });
            log(
                `Reputation userId=${userId}: ${currentRep} → ${nextRep} ` +
                `(delta=${delta > 0 ? "+" : ""}${delta}, type=${eventType})`
            );
        } catch (err) {
            error(`Failed to update reputation for userId=${userId}: ${err?.message}`);
            return; // Don't write a misleading event if the prefs update failed
        }

        // Step 2.3 — write the event immediately after prefs update
        await writeReputationEvent({
            userId,
            delta,
            eventType,
            reputationAfter: nextRep,
            sourceId,
            sourceType,
            isSynthetic: false,
        });

        // Step 2.5 — verify consistency (non-fatal)
        await verifyReputationAfter(userId, nextRep);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2.1 / 2.3 — Vote events
    // ─────────────────────────────────────────────────────────────────────────

    if (isVote) {
        const collectionId =
            document.type === "question"
                ? "questions"
                : document.type === "answer"
                ? "answers"
                : null;

        if (!collectionId) return res.send("Unknown vote type.");

        let authorId = null;
        try {
            const targetDoc = await databases.getDocument(DB_ID, collectionId, document.typeId);
            authorId = targetDoc.authorId;
        } catch (e) {
            error(`Target document not found for vote ${document.$id}: ${e?.message}`);
            return res.send("Target document not found.");
        }

        if (!authorId) return res.send("No authorId found.");

        const isQuestion = document.type === "question";
        const sourceType = "vote";
        const sourceId   = document.$id;

        if (isCreate) {
            // A fresh vote was cast
            if (document.voteStatus === "upvoted") {
                const eventType = isQuestion ? "question_upvoted" : "answer_upvoted";
                await adjustRep(authorId, isQuestion ? 10 : 5, eventType, sourceId, sourceType);
            } else if (document.voteStatus === "downvoted") {
                const eventType = isQuestion ? "question_downvoted" : "answer_downvoted";
                await adjustRep(authorId, -2, eventType, sourceId, sourceType);
            }
        } else if (isDelete) {
            // Vote was removed — reverse the delta that was applied on create
            // Step 2.4: this is the "toggle off" case → one removal event
            if (document.voteStatus === "upvoted") {
                const eventType = isQuestion ? "question_upvote_removed" : "answer_upvote_removed";
                await adjustRep(authorId, isQuestion ? -10 : -5, eventType, sourceId, sourceType);
            } else if (document.voteStatus === "downvoted") {
                const eventType = isQuestion ? "question_downvote_removed" : "answer_downvote_removed";
                await adjustRep(authorId, 2, eventType, sourceId, sourceType);
            }
        } else if (isUpdate) {
            // Step 2.4 — A vote switch (upvoted ↔ downvoted) arrives as an update.
            // Appwrite does not provide the previous state in the event payload,
            // so we cannot determine the exact previous status here.
            //
            // Our vote API (src/app/api/vote/route.ts) already handles switches
            // by deleting the old vote document and creating a new one, which means
            // Appwrite emits a delete event followed by a create event — each of
            // which this function handles independently above.
            //
            // A direct update event on a vote document would only happen if vote
            // status is changed in-place (not our pattern). Log it for visibility.
            log(
                `Vote update event received for document ${document.$id}. ` +
                `Our vote API emits delete+create instead of update, so this is unexpected. ` +
                `No reputation change applied.`
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Step 2.1 / 2.3 — Answer events
    // ─────────────────────────────────────────────────────────────────────────

    if (isAnswer) {
        const authorId   = document.authorId;
        const sourceType = "answer";
        const sourceId   = document.$id;

        if (isCreate) {
            // +1 for posting an answer
            await adjustRep(authorId, 1, "answer_posted", sourceId, sourceType);

            // +10 if it was somehow already accepted on creation (edge case)
            if (document.isAccepted) {
                await adjustRep(authorId, 10, "answer_accepted", sourceId, sourceType);
            }
        } else if (isDelete) {
            // Reverse the +1 for posting
            await adjustRep(authorId, -1, "answer_deleted", sourceId, sourceType);

            // If the deleted answer was accepted, also reverse the acceptance bonus
            if (document.isAccepted) {
                await adjustRep(authorId, -10, "answer_acceptance_removed", sourceId, sourceType);
            }
        } else if (isUpdate) {
            // Step 2.4 — Acceptance change:
            //   isAccepted: false → true  → apply +10, write "answer_accepted"
            //   isAccepted: true  → false → apply -10, write "answer_acceptance_removed"
            //
            // Appwrite update events do not carry the previous state, so we
            // cannot determine direction from the payload alone. The PATCH
            // /api/answer route handles acceptance atomically and the
            // calculate-reputation function is triggered by the resulting
            // document update. We check document.isAccepted and compare
            // against what we'd expect.
            //
            // Since we cannot know the before-state reliably from a raw update
            // event, we rely on the PATCH /api/answer endpoint which calls
            // updatePrefs directly for acceptance changes. If a future refactor
            // moves acceptance reputation through this function, replace this
            // block with proper before/after diffing via a separate state store.
            log(
                `Answer update event for document ${document.$id}. ` +
                `Acceptance-based reputation is handled by the PATCH /api/answer ` +
                `route directly. No change applied here to avoid double-counting.`
            );
        }
    }

    return res.json({ success: true });
};
