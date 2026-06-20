// src/lib/skills/trigger-skill-recalculation.ts
// Phase 3 — Step 3.2 (Phase 8 — Step 8.3: success logging now centralized
// in per-tag-calculator.ts so every caller of recalculateUserTagScore logs
// uniformly; this file keeps only debounce/error logs specific to the
// event-trigger pathway).
/**
 * triggerSkillRecalculation utility function.
 *
 * Single function called from any API route when a skill-relevant event occurs.
 * Internally it:
 *   1. Checks debounce (Step 3.6) — skips if a recalculation was already
 *      triggered for this userId+tag within the last 30 seconds.
 *   2. Writes a job record to skill_calculation_events.
 *   3. Runs the actual recalculation asynchronously (fire-and-forget) so the
 *      originating API route returns immediately without blocking on scoring.
 *
 * All API routes call this one function — they contain zero calculation logic.
 */

import { ID, Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, skillCalcEventsCollection } from "@/models/name";
import { recalculateUserTagScore } from "./per-tag-calculator";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Minimum milliseconds between recalculations for the same userId+tag pair. */
const DEBOUNCE_MS = 30_000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type SkillTriggerType =
    | "vote_cast"
    | "answer_posted"
    | "answer_accepted"
    | "question_posted"
    | "decay_run"
    | "backfill";

export type SkillTriggerPriority = "low" | "normal" | "high";

export interface TriggerSkillRecalculationOptions {
    userId: string;
    /** One or more tags to recalculate. Commonly a question's tag array. */
    tags: string[];
    triggerType: SkillTriggerType;
    priority?: SkillTriggerPriority;
    /** ID of the document that caused this event (vote, answer, question). */
    sourceDocumentId?: string;
}

// ─── Debounce check ───────────────────────────────────────────────────────────

/**
 * Returns true if a recalculation was already triggered for this userId+tag
 * within the debounce window, meaning we should skip this one.
 *
 * Uses the skill_calculation_events audit log as the shared state so the check
 * works across multiple serverless instances (no in-process memory required).
 */
async function isDebounced(userId: string, tag: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - DEBOUNCE_MS).toISOString();

    try {
        const recent = await databases.listDocuments(db, skillCalcEventsCollection, [
            Query.equal("userId", userId),
            Query.equal("tag", tag),
            Query.greaterThan("scheduledAt", cutoff),
            Query.limit(1),
        ]);

        return recent.total > 0;
    } catch {
        // If the debounce check itself fails, allow the recalculation to proceed
        // rather than silently dropping score updates.
        return false;
    }
}

// ─── Main trigger function ────────────────────────────────────────────────────

/**
 * Trigger a skill recalculation for a user across one or more tags.
 *
 * This function is intentionally fire-and-forget — it does not await the
 * actual recalculation so the calling API route can return immediately.
 * Errors inside the background task are caught and logged without propagating.
 *
 * @param options  userId, tags[], triggerType, priority, sourceDocumentId
 */
export function triggerSkillRecalculation(
    options: TriggerSkillRecalculationOptions
): void {
    const {
        userId,
        tags,
        triggerType,
        priority = "normal",
        sourceDocumentId,
    } = options;

    if (!userId || !tags || tags.length === 0) return;

    // Run entirely in the background — no await, no blocking the caller.
    void (async () => {
        for (const tag of tags) {
            try {
                // ── Step 3.6: Debounce ────────────────────────────────────
                const debounced = await isDebounced(userId, tag);
                if (debounced) {
                    console.log(
                        `[skill-trigger] Debounced userId=${userId} tag=${tag} triggerType=${triggerType}`
                    );
                    continue;
                }

                // ── Write pending event to audit log ──────────────────────
                const now = new Date().toISOString();
                let eventDocId: string | null = null;

                try {
                    const eventDoc = await databases.createDocument(
                        db,
                        skillCalcEventsCollection,
                        ID.unique(),
                        {
                            userId,
                            tag,
                            triggerType,
                            priority,
                            status: "processing",
                            previousScore: 0, // will be overwritten by recalculator
                            newScore:      0,
                            scheduledAt:   now,
                            ...(sourceDocumentId ? { sourceDocumentId } : {}),
                        }
                    );
                    eventDocId = eventDoc.$id;
                } catch (logErr) {
                    // Non-fatal — if the audit log write fails, still attempt
                    // the recalculation so scores don't go stale.
                    console.error(
                        `[skill-trigger] Failed to write event log userId=${userId} tag=${tag}: ${
                            (logErr as any)?.message
                        }`
                    );
                }

                // ── Run the actual recalculation ──────────────────────────
                // Score-update logging (userId, tag, old/new score, trigger
                // type) happens inside recalculateUserTagScore itself —
                // see Phase 8 / Step 8.3 — so every caller logs uniformly.
                try {
                    const result = await recalculateUserTagScore(userId, tag, triggerType);

                    // Update the pending event doc to completed
                    if (eventDocId) {
                        await databases
                            .updateDocument(db, skillCalcEventsCollection, eventDocId, {
                                status:        "completed",
                                previousScore: result.previousScore,
                                newScore:      result.compositeScore,
                                completedAt:   new Date().toISOString(),
                            })
                            .catch(() => undefined); // non-fatal
                    }
                } catch (calcErr: any) {
                    console.error(
                        `[skill-trigger] Recalculation failed userId=${userId} tag=${tag}: ${calcErr?.message}`
                    );

                    if (eventDocId) {
                        await databases
                            .updateDocument(db, skillCalcEventsCollection, eventDocId, {
                                status:       "failed",
                                errorMessage: String(calcErr?.message ?? "Unknown error").slice(0, 500),
                                completedAt:  new Date().toISOString(),
                            })
                            .catch(() => undefined);
                    }
                }
            } catch (outerErr: any) {
                console.error(
                    `[skill-trigger] Outer error userId=${userId} tag=${tag}: ${outerErr?.message}`
                );
            }
        }
    })();
}

// ─── Convenience helpers ──────────────────────────────────────────────────────

/**
 * Resolve the tag array for a question ID without an extra DB call when the
 * caller already has the tags in scope.  Used by vote and answer triggers.
 */
export function tagsFromQuestion(question: { tags?: string[] } | null | undefined): string[] {
    return (question?.tags ?? []).filter(Boolean);
}
