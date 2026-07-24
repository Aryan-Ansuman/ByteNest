import { ADR_DIMENSIONS, type AdrDimension } from "@/models/name";

// ─── Architecture Decision Record (ADR) Questions ───────────────────────────
// Human-readable labels for the fixed dimension catalog (Decision 2). Used
// anywhere a dimension ID needs to be shown to a person — the consensus
// worker's system comments (Phase 8) and the radar chart's spoke labels
// (Phase 5) both import this single map so the wording never drifts.
export const ADR_DIMENSION_LABELS: Record<AdrDimension, string> = {
    performance: "Performance",
    scalability: "Scalability",
    developer_experience: "Developer Experience",
    ecosystem_maturity: "Ecosystem Maturity",
    long_term_maintainability: "Long-Term Maintainability",
    security: "Security",
    learning_curve: "Learning Curve",
    operational_complexity: "Operational Complexity",
};

export function isAdrDimension(value: string): value is AdrDimension {
    return (ADR_DIMENSIONS as readonly string[]).includes(value);
}

export function labelForDimension(dimensionId: string): string {
    return isAdrDimension(dimensionId) ? ADR_DIMENSION_LABELS[dimensionId] : dimensionId;
}
