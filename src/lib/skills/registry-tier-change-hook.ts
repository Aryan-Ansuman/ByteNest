/**
 * Phase 6 — Step 6.3
 * Tier-change registry trigger.
 *
 * When a user crosses a tier boundary (e.g. Practitioner → Expert),
 * immediately rebuild the registry for every affected tag in the background
 * rather than waiting for the next hourly scheduled run.
 *
 * This is called from inside triggerSkillRecalculation after a successful
 * recalculation produces a tier change.
 *
 * It is fire-and-forget — the caller never awaits it.
 */

import { buildRegistryForTag } from "./registry-builder";

// ─── Tier-change hook ─────────────────────────────────────────────────────────

/**
 * Fire-and-forget: rebuild the expert registry for each affected tag
 * when a user's tier changes.
 *
 * @param tags     The tags to rebuild (should be the tags of the question/answer that triggered the recalc).
 * @param context  Optional logging context (userId, old tier → new tier) for debugging.
 */
export function triggerRegistryRebuildOnTierChange(
    tags: string[],
    context?: {
        userId: string;
        previousTier: string;
        newTier: string;
    }
): void {
    if (!tags || tags.length === 0) return;

    void (async () => {
        for (const tag of tags) {
            try {
                const { written, removed } = await buildRegistryForTag(tag);

                if (context) {
                    console.log(
                        `[registry-tier-change] Rebuilt tag="${tag}" ` +
                        `userId=${context.userId} ` +
                        `${context.previousTier} → ${context.newTier} ` +
                        `(+${written} written, -${removed} removed)`
                    );
                } else {
                    console.log(
                        `[registry-tier-change] Rebuilt tag="${tag}" ` +
                        `(+${written} written, -${removed} removed)`
                    );
                }
            } catch (err: any) {
                console.error(
                    `[registry-tier-change] Failed to rebuild tag="${tag}": ${err?.message}`
                );
            }
        }
    })();
}
