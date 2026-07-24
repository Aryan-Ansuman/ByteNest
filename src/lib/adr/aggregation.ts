import type { AdrExpertiseLevel } from "@/models/name";

// ─── Architecture Decision Record (ADR) Questions — Phase 4 ────────────────
// Pure aggregation engine. No Appwrite, no API, no UI — takes raw submission
// documents in, returns aggregated scores out. Used by both the radar chart
// view (Phase 5, not yet built) and the consensus-detection worker
// (Phase 8), so the two never compute "what the community thinks" two
// different ways.

export type AdrScoreSubmissionInput = {
    // JSON-encoded { [dimensionId]: 1-5 }, exactly as stored on
    // adr_score_submissions.optionAScores / optionBScores.
    optionAScores: string;
    optionBScores: string;
    expertise: AdrExpertiseLevel;
};

export type DimensionSideAggregate = {
    mean: number;
    weightedMean: number;
    stdDev: number;
    count: number;
};

export type DimensionAggregate = {
    optionA: DimensionSideAggregate;
    optionB: DimensionSideAggregate;
    // Positive => Option A leads on this dimension, negative => Option B
    // leads. Computed from the weighted mean — see aggregateAdrSubmissions
    // doc comment for why weighted (not simple) mean drives every
    // leadership judgement in this module.
    spread: number;
    // 1 - (stdDev / 2.5), clamped to [0, 1]. High = community converged on
    // similar scores for this dimension; low = community is divided (wide
    // confidence band on the chart).
    agreementIndex: number;
};

export type AdrConsensusSummary = {
    optionALeadCount: number;
    optionBLeadCount: number;
    // sum(optionA weighted means) - sum(optionB weighted means) across all
    // selected dimensions. Positive => A ahead overall.
    aggregateGap: number;
    dimensionsWonByA: string[];
    dimensionsWonByB: string[];
    // True only when every dimension's |weighted mean A - weighted mean B|
    // is under 0.5 — the "community is evenly split" signal for Phase 8.
    isEvenlySplit: boolean;
};

export type AdrAggregation = {
    dimensions: Record<string, DimensionAggregate>;
    consensus: AdrConsensusSummary;
    submissionCount: number;
};

// Decision 8: self-declared expertise multiplier applied before averaging.
const EXPERTISE_WEIGHTS: Record<AdrExpertiseLevel, number> = {
    novice: 1.0,
    intermediate: 1.5,
    expert: 2.0,
};

// "Both options are within 0.5 points across all dimensions" — the no-clear-
// consensus threshold from Phase 8.
const EVENLY_SPLIT_THRESHOLD = 0.5;

function safeParseScores(json: string): Record<string, number> {
    try {
        const parsed = JSON.parse(json);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

function mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function weightedMean(values: number[], weights: number[]): number {
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) return 0;
    const weightedSum = values.reduce((sum, v, i) => sum + v * weights[i], 0);
    return weightedSum / totalWeight;
}

function stdDev(values: number[], m: number): number {
    if (values.length === 0) return 0;
    const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
    return Math.sqrt(variance);
}

function agreementIndexFor(sideStdDevs: [number, number]): number {
    const avgStdDev = (sideStdDevs[0] + sideStdDevs[1]) / 2;
    return Math.max(0, Math.min(1, 1 - avgStdDev / 2.5));
}

/**
 * Aggregates raw score-card submissions into per-dimension, per-option
 * statistics plus a consensus summary.
 *
 * `dimensionIds` should be the question's `adrDimensions` (author-selected,
 * ordered) — aggregation only ever runs over that fixed set, regardless of
 * whether a given submission happens to contain stray extra keys.
 */
export function aggregateAdrSubmissions(
    submissions: AdrScoreSubmissionInput[],
    dimensionIds: string[]
): AdrAggregation {
    const dimensions: Record<string, DimensionAggregate> = {};

    let aggregateGap = 0;
    let optionALeadCount = 0;
    let optionBLeadCount = 0;
    const dimensionsWonByA: string[] = [];
    const dimensionsWonByB: string[] = [];
    let allWithinEvenSplitThreshold = dimensionIds.length > 0;

    for (const dimensionId of dimensionIds) {
        const aValues: number[] = [];
        const bValues: number[] = [];
        const weights: number[] = [];

        for (const submission of submissions) {
            const aScores = safeParseScores(submission.optionAScores);
            const bScores = safeParseScores(submission.optionBScores);
            const aScore = Number(aScores[dimensionId]);
            const bScore = Number(bScores[dimensionId]);
            // A submission only contributes to this dimension if it actually
            // scored it — partial submissions (shouldn't happen given
            // Decision 3's all-or-nothing validation in Phase 3, but this
            // module doesn't assume that validation ran) don't skew the mean
            // with fabricated zeros.
            if (!Number.isFinite(aScore) || !Number.isFinite(bScore)) continue;
            aValues.push(aScore);
            bValues.push(bScore);
            weights.push(EXPERTISE_WEIGHTS[submission.expertise] ?? 1.0);
        }

        const aMean = mean(aValues);
        const bMean = mean(bValues);
        const aWeightedMean = weightedMean(aValues, weights);
        const bWeightedMean = weightedMean(bValues, weights);
        const aStdDev = stdDev(aValues, aMean);
        const bStdDev = stdDev(bValues, bMean);

        dimensions[dimensionId] = {
            optionA: { mean: aMean, weightedMean: aWeightedMean, stdDev: aStdDev, count: aValues.length },
            optionB: { mean: bMean, weightedMean: bWeightedMean, stdDev: bStdDev, count: bValues.length },
            spread: aWeightedMean - bWeightedMean,
            agreementIndex: agreementIndexFor([aStdDev, bStdDev]),
        };

        if (aValues.length === 0) continue;

        // Consensus leadership: driven by the weighted mean throughout, not
        // the simple mean — Decision 8 makes expertise-weighting the more
        // authoritative view, and Phase 8's consensus rule is stated in
        // terms of "weighted mean score", so the aggregate gap below uses
        // the same basis rather than silently switching to simple means.
        aggregateGap += aWeightedMean - bWeightedMean;
        if (aWeightedMean > bWeightedMean) {
            optionALeadCount += 1;
            dimensionsWonByA.push(dimensionId);
        } else if (bWeightedMean > aWeightedMean) {
            optionBLeadCount += 1;
            dimensionsWonByB.push(dimensionId);
        }

        if (Math.abs(aWeightedMean - bWeightedMean) >= EVENLY_SPLIT_THRESHOLD) {
            allWithinEvenSplitThreshold = false;
        }
    }

    return {
        dimensions,
        consensus: {
            optionALeadCount,
            optionBLeadCount,
            aggregateGap,
            dimensionsWonByA,
            dimensionsWonByB,
            isEvenlySplit: allWithinEvenSplitThreshold,
        },
        submissionCount: submissions.length,
    };
}
