/**
 * Phase 2 — Skills Engine Public API
 *
 * Re-exports everything needed by Phase 3 (event-driven triggers)
 * and Phase 4 (API layer) from a single import path:
 *
 *   import { recalculateUserTagScore, runTemporalDecayJob } from "@/lib/skills";
 */

// Step 2.1 — Pure scoring functions
export {
    computeAnswerQualityScore,
    computeQuestionQualityScore,
    computeTemporalConsistencyScore,
    computePeerValidationScore,
} from "./scoring-functions";

export type {
    AnswerActivity,
    QuestionActivity,
    PeerVoter,
} from "./scoring-functions";

// Step 2.2 — Composite aggregator
export {
    aggregateScore,
    getTier,
    crossedTierBoundary,
    SCORE_WEIGHTS,
    TIER_THRESHOLDS,
} from "./composite-aggregator";

export type {
    SubScores,
    AggregatedScore,
    SkillTier,
    TrendDirection,
} from "./composite-aggregator";

// Step 2.3 — Per-user-per-tag calculator
export { recalculateUserTagScore } from "./per-tag-calculator";
export type { RecalcResult } from "./per-tag-calculator";

// Step 2.4 — Full user recalculation job
export {
    recalculateAllTagsForUser,
    batchRecalculateUsers,
} from "./full-user-recalculation";

export type { BatchRecalcOptions } from "./full-user-recalculation";

// Step 2.5 — Temporal decay job
export {
    runTemporalDecayJob,
    decayJobHandler,
} from "./temporal-decay-job";

export type { DecayRunSummary } from "./temporal-decay-job";
