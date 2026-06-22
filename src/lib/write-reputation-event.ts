/**
 * Phase 6, Step 6.2 — writeReputationEvent
 * (Merged with Phase 2 and Phase 10 Observability enhancements)
 *
 * The single place that appends to reputation_events AND immediately
 * invalidates the trajectory cache for that user.
 *
 * Called from the calculate-reputation Appwrite Function (Phase 2) after
 * every atomic reputation mutation. Cache invalidation errors are logged
 * but never thrown — reputation correctness takes priority.
 */

import { ID } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db } from "@/models/name";
import { invalidateTrajectoryCache } from "./trajectory-cache";

const REPUTATION_EVENTS_COLLECTION = "reputation_events";

export type ReputationEventType =
    | "answer_upvoted"
    | "answer_downvoted"
    | "answer_upvote_removed"
    | "answer_downvote_removed"
    | "answer_accepted"
    | "answer_acceptance_removed"
    | "question_upvoted"
    | "question_downvoted"
    | "question_upvote_removed"
    | "question_downvote_removed"
    | "answer_posted"
    | "answer_deleted"
    | "manual_adjustment"
    | "historical_baseline";

export type ReputationSourceType = "vote" | "answer" | "question" | "system";

export interface WriteReputationEventOptions {
    userId:           string;
    delta:            number;
    eventType:        ReputationEventType;
    reputationAfter:  number;
    sourceId?:        string;
    sourceType?:      ReputationSourceType;
    isSynthetic?:     boolean;
}

/**
 * Append one reputation event to the event log and invalidate the cached
 * trajectory so the sidebar widget reflects the change immediately.
 *
 * Returns the created document ID on success, or null if the write failed.
 */
export async function writeReputationEvent(
    options: WriteReputationEventOptions
): Promise<string | null> {
    const {
        userId,
        delta,
        eventType,
        reputationAfter,
        sourceId,
        sourceType,
        isSynthetic = false,
    } = options;

    if (!userId) {
        console.error("[writeReputationEvent] userId is required — event not written");
        return null;
    }

    if (delta === 0) {
        // A zero delta is a no-op and does not belong in the audit log.
        return null;
    }

    const now = new Date().toISOString();
    let docId: string | null = null;

    // ── 1. Append to reputation_events ────────────────────────────────────────
    try {
        const doc = await databases.createDocument(
            db,
            REPUTATION_EVENTS_COLLECTION,
            ID.unique(),
            {
                userId,
                delta,
                eventType,
                reputationAfter,
                createdAt:   now,
                isSynthetic,
                ...(sourceId   ? { sourceId }   : {}),
                ...(sourceType ? { sourceType } : {}),
            }
        );
        docId = doc.$id;
    } catch (err: any) {
        // Step 10.2: Monitor event write failure rate
        console.error(
            `[writeReputationEvent] Failed to write event for userId=${userId} ` +
            `eventType=${eventType} delta=${delta}: ${err?.message ?? err}`
        );
        return null; // skip cache invalidation if event write failed
    }

    // ── 2. Invalidate trajectory cache (Step 6.2) ─────────────────────────────
    try {
        await invalidateTrajectoryCache(userId);
    } catch (err: any) {
        // Non-fatal — stale cache is acceptable; TTL will clear it within 30 min
        console.error(
            `[writeReputationEvent] Cache invalidation failed for userId=${userId}: ${err?.message}`
        );
    }

    return docId;
}

// ─── Step 2.5 — Consistency check helper ─────────────────────────────────────

/**
 * After writing a reputation event, optionally verify that the stored
 * `reputationAfter` matches what is actually in `user.prefs.reputation`.
 *
 * Discrepancies indicate a race condition or a bug in the reputation
 * calculation flow. The check is non-fatal — it only logs a warning.
 *
 * @param userId          The user whose reputation was just changed.
 * @param expectedReputation  The value we stored in `reputationAfter`.
 * @param fetchUserPrefs  Async function that returns the live reputation.
 */
export async function verifyReputationAfter(
    userId: string,
    expectedReputation: number,
    fetchUserPrefs: () => Promise<number>
): Promise<void> {
    try {
        const liveReputation = await fetchUserPrefs();

        if (liveReputation !== expectedReputation) {
            console.warn(
                `[writeReputationEvent] Consistency mismatch for userId=${userId}: ` +
                `stored reputationAfter=${expectedReputation} but ` +
                `live user.prefs.reputation=${liveReputation}. ` +
                `This may indicate a concurrent reputation update.`
            );
        }
    } catch (err: any) {
        // Verification failure is non-fatal.
        console.warn(
            `[writeReputationEvent] Could not verify reputationAfter for userId=${userId}: ${err?.message}`
        );
    }
}
