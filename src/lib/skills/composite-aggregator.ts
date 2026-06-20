/**
 * Phase 2 — Step 2.2
 * Composite score aggregator.
 *
 * Takes the four sub-scores, applies configurable weights, and returns:
 *  - compositeScore (0–100)
 *  - tier label
 *  - trendDirection compared to a previous score
 *
 * Weights are configurable constants — tune here without touching any logic.
 */

// ─── Configurable weights (must sum to 1.0) ───────────────────────────────────

export const SCORE_WEIGHTS = {
    answerQuality:        0.40,
    questionQuality:      0.20,
    temporalConsistency:  0.25,
    peerValidation:       0.15,
} as const;

// ─── Tier thresholds ──────────────────────────────────────────────────────────

export type SkillTier = "Newcomer" | "Apprentice" | "Practitioner" | "Expert" | "Authority";

export const TIER_THRESHOLDS: { min: number; tier: SkillTier }[] = [
    { min: 85, tier: "Authority" },
    { min: 65, tier: "Expert" },
    { min: 40, tier: "Practitioner" },
    { min: 15, tier: "Apprentice" },
    { min: 0,  tier: "Newcomer" },
];

export type TrendDirection = "up" | "stable" | "down";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SubScores {
    answerQualityScore:       number;
    questionQualityScore:     number;
    temporalConsistencyScore: number;
    peerValidationScore:      number;
}

export interface AggregatedScore {
    compositeScore:  number;
    tier:            SkillTier;
    trendDirection:  TrendDirection;
}

// ─── Aggregator ───────────────────────────────────────────────────────────────

/**
 * Compute the weighted composite score, assign a tier, and determine
 * trend direction relative to a previous score.
 *
 * @param subScores     The four sub-scores (each 0–100).
 * @param previousScore The composite score from the last calculation (0–100).
 *                      Defaults to 0 (e.g. first calculation).
 * @param trendThreshold Minimum point delta required to call it "up" or "down".
 *                       Defaults to 2 to avoid noise.
 */
export function aggregateScore(
    subScores: SubScores,
    previousScore = 0,
    trendThreshold = 2
): AggregatedScore {
    const raw =
        subScores.answerQualityScore       * SCORE_WEIGHTS.answerQuality +
        subScores.questionQualityScore     * SCORE_WEIGHTS.questionQuality +
        subScores.temporalConsistencyScore * SCORE_WEIGHTS.temporalConsistency +
        subScores.peerValidationScore      * SCORE_WEIGHTS.peerValidation;

    const compositeScore = Math.min(100, Math.max(0, Math.round(raw * 10) / 10));

    const tier = getTier(compositeScore);

    const delta = compositeScore - previousScore;
    let trendDirection: TrendDirection = "stable";
    if (delta >= trendThreshold) trendDirection = "up";
    else if (delta <= -trendThreshold) trendDirection = "down";

    return { compositeScore, tier, trendDirection };
}

/**
 * Map a composite score to its tier label.
 */
export function getTier(compositeScore: number): SkillTier {
    for (const { min, tier } of TIER_THRESHOLDS) {
        if (compositeScore >= min) return tier;
    }
    return "Newcomer";
}

/**
 * Returns true when a score transition crosses a tier boundary.
 * Used by Phase 6 to trigger immediate registry rebuilds on promotions.
 */
export function crossedTierBoundary(previousScore: number, newScore: number): boolean {
    return getTier(previousScore) !== getTier(newScore);
}
