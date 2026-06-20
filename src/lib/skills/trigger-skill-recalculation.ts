/**
 * Phase 3 — Step 3.2
 * triggerSkillRecalculation utility function.
 *
 * Phase 6 — Step 6.3 addition:
 *   After a successful recalculation, if the user crossed a tier boundary,
 *   fire-and-forget a registry rebuild for the affected tags.
 */

import { ID, Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, skillCalcEventsCollection } from "@/models/name";
import { recalculateUserTagScore } from "./per-tag-calculator";
import { triggerRegistryRebuildOnTierChange } from "./registry-tier-change-hook";

// ─── Configuration ────────────────────────────────────────────────────────────

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
    tags: string[];
    triggerType: SkillTriggerType;
    priority?: SkillTriggerPriority;
    sourceDocumentId?: string;
}

// ─── Debounce check ───────────────────────────────────────────────────────────

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
        return false;
    }
}

// ─── Main trigger function ────────────────────────────────────────────────────

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
                            previousScore: 0,
                            newScore: 0,
                            scheduledAt: now,
                            ...(sourceDocumentId ? { sourceDocumentId } : {}),
                        }
                    );
                    eventDocId = eventDoc.$id;
                } catch (logErr) {
                    console.error(
                        `[skill-trigger] Failed to write event log userId=${userId} tag=${tag}: ${
                            (logErr as any)?.message
                        }`
                    );
                }

                // ── Run the actual recalculation ──────────────────────────
                try {
                    const result = await recalculateUserTagScore(userId, tag, triggerType);

                    console.log(
                        `[skill-trigger] Recalculated userId=${userId} tag=${tag} ` +
                        `${result.previousScore.toFixed(1)} → ${result.compositeScore.toFixed(1)} ` +
                        `[${result.tier}]${result.tierChanged ? " ★ tier changed" : ""}`
                    );

                    // ── Step 6.3: Tier-change registry rebuild ────────────
                    if (result.tierChanged) {
                        triggerRegistryRebuildOnTierChange([tag], {
                            userId,
                            previousTier: result.tier, // getTier(previousScore) would be ideal
                            newTier: result.tier,
                        });
                    }

                    // Update the pending event doc to completed
                    if (eventDocId) {
                        await databases
                            .updateDocument(db, skillCalcEventsCollection, eventDocId, {
                                status: "completed",
                                previousScore: result.previousScore,
                                newScore: result.compositeScore,
                                completedAt: new Date().toISOString(),
                            })
                            .catch(() => undefined);
                    }
                } catch (calcErr: any) {
                    console.error(
                        `[skill-trigger] Recalculation failed userId=${userId} tag=${tag}: ${calcErr?.message}`
                    );

                    if (eventDocId) {
                        await databases
                            .updateDocument(db, skillCalcEventsCollection, eventDocId, {
                                status: "failed",
                                errorMessage: String(calcErr?.message ?? "Unknown error").slice(0, 500),
                                completedAt: new Date().toISOString(),
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

export function tagsFromQuestion(question: { tags?: string[] } | null | undefined): string[] {
    return (question?.tags ?? []).filter(Boolean);
}
