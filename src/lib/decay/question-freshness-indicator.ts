import { Query } from "node-appwrite";
import { db, answerCollection, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import type { FreshnessLabel } from "./types";

export type AnswerFreshnessIndicator = "fresh" | "outdated" | "none";

/**
 * Phase 8 — derives the three-state dot shown on question cards:
 *   - "fresh"    (green)  at least one answer is "fresh" or "aging"
 *   - "outdated" (amber)  has answers, but every one is "outdated" or "stale"
 *   - "none"     (grey)   no answers yet
 *
 * Computed from `answers.freshnessLabel` rather than stored redundantly on
 * each answer — the question doc is the one place a reader looks up this
 * signal, so it's the right place to denormalize it to.
 */
export function deriveFreshnessIndicator(labels: Array<FreshnessLabel | null | undefined>): AnswerFreshnessIndicator {
    if (labels.length === 0) return "none";
    const hasFreshOrAging = labels.some((label) => label === "fresh" || label === "aging");
    return hasFreshOrAging ? "fresh" : "outdated";
}

/**
 * Re-reads every answer's freshnessLabel for one question and writes the
 * derived indicator back. Cheap (one Query.select fetch, no pagination
 * needed beyond Appwrite's default page since questions rarely have more
 * than a few dozen answers) — safe to call inline from request handlers.
 *
 * Best-effort: swallows errors so a freshness-indicator hiccup never blocks
 * the caller's primary action (voting, staleness reporting, posting an
 * answer). Also tolerates the attribute not existing yet on older DBs,
 * same pattern as syncQuestionAnswerMetadata in the answer route.
 */
export async function recomputeQuestionFreshnessIndicator(questionId: string | null | undefined): Promise<void> {
    if (!questionId) return;

    try {
        const { documents: answers } = await databases.listDocuments(db, answerCollection, [
            Query.equal("questionId", questionId),
            Query.select(["freshnessLabel"]),
            Query.limit(100),
        ]);

        const indicator = deriveFreshnessIndicator(answers.map((a) => a.freshnessLabel as FreshnessLabel | null));

        await databases.updateDocument(db, questionCollection, questionId, {
            answerFreshnessIndicator: indicator,
        });
    } catch (error: any) {
        const missingAttribute =
            /attribute not found|unknown attribute|invalid document structure/i.test(error?.message ?? "") &&
            /answerFreshnessIndicator/i.test(error?.message ?? "");
        if (!missingAttribute) {
            console.error(`[freshness-indicator] Failed to update question ${questionId}:`, error?.message ?? error);
        }
    }
}
