import { publishEvent } from "@/lib/events";
import type { LlmSmellValidationPayload } from "@/lib/events/types";

type PendingSmellDetection = LlmSmellValidationPayload["pendingSmells"][0];

// Phase 5 decision: trigger LLM validation only when it's likely to add
// signal. Checked against the question title, case-insensitively.
export const HIGH_SIGNAL_TITLE_PHRASES = [
    "slow",
    "memory leak",
    "not working",
    "crash",
    "out of memory",
    "performance issue",
    "too many requests",
    "hanging",
    "deadlock",
] as const;

export type Stage1Outcome = {
    /** Medium/low-confidence detections from Phase 4's pattern matching — empty if none. */
    needsLLM: PendingSmellDetection[];
    /** True if Stage 1 found zero smells of any confidence for this question. */
    foundNothing: boolean;
};

/**
 * Two trigger conditions (Phase 5 spec):
 *   1. Stage 1 passed explicit needsLLM detections, or
 *   2. Stage 1 found zero smells AND the title contains a high-signal phrase.
 * Neither holds -> skip LLM entirely, question stays at whatever Stage 1 produced.
 */
export function shouldTriggerLlmValidation(outcome: Stage1Outcome, title: string): boolean {
    if (outcome.needsLLM.length > 0) return true;
    if (!outcome.foundNothing) return false;

    const normalizedTitle = title.toLowerCase();
    return HIGH_SIGNAL_TITLE_PHRASES.some((phrase) => normalizedTitle.includes(phrase));
}

/**
 * Enqueues the Phase 5 job. Call this from Phase 4's worker (Step 6) after
 * `shouldTriggerLlmValidation` returns true. Fire-and-forget by convention
 * with the rest of this codebase's event publishing — callers should not
 * await this before responding to their own caller.
 */
export async function enqueueLlmSmellValidation(params: {
    questionId: string;
    contentHash: string;
    pendingSmells: PendingSmellDetection[];
    titleContext: string;
}): Promise<void> {
    await publishEvent("LlmSmellValidation", {
        questionId: params.questionId,
        contentHash: params.contentHash,
        pendingSmells: params.pendingSmells,
        titleContext: params.titleContext,
    });
}
