export type PrStatus = "open" | "merged" | "closed";

export type PrReadOnlyQuestion = {
    questionType: string;
    prStatus: PrStatus | null;
    prMergedAt: string | null;
    prClosedAt: string | null;
};

/**
 * Soft read-only mode: once a PR is merged or closed, new line-anchored
 * answers are disabled (the diff is a frozen historical snapshot), but
 * general discussion and edits to existing content are still allowed —
 * see Phase 8 spec. Non-PR questions are never read-only via this check.
 */
export function isPrDiffReadOnly(question: PrReadOnlyQuestion): boolean {
    if (question.questionType !== "pr_linked") return false;
    return question.prStatus === "merged" || question.prStatus === "closed";
}

export function prReadOnlyReason(question: PrReadOnlyQuestion): string | null {
    if (!isPrDiffReadOnly(question)) return null;
    const date = question.prStatus === "merged" ? question.prMergedAt : question.prClosedAt;
    const formatted = date ? new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "an earlier date";
    return question.prStatus === "merged"
        ? `This PR was merged on ${formatted}. The diff is a historical snapshot.`
        : `This PR was closed on ${formatted}. The diff is a historical snapshot.`;
}
