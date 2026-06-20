/**
 * Skills Engine Public API
 *
 * Re-exports everything needed by Phase 3 (event-driven triggers),
 * Phase 4 (API layer), Phase 5 (UI), and Phase 6 (registry builder)
 * from a single import path.
 */

// Phase 2 — Step 2.1: Pure scoring functions
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

// Phase 2 — Step 2.2: Composite aggregator
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

// Phase 2 — Step 2.3: Per-user-per-tag calculator
export { recalculateUserTagScore } from "./per-tag-calculator";
export type { RecalcResult } from "./per-tag-calculator";

// Phase 2 — Step 2.4: Full user recalculation job
export {
    recalculateAllTagsForUser,
    batchRecalculateUsers,
} from "./full-user-recalculation";

export type { BatchRecalcOptions } from "./full-user-recalculation";

// Phase 2 — Step 2.5: Temporal decay job
export {
    runTemporalDecayJob,
    decayJobHandler,
} from "./temporal-decay-job";

export type { DecayRunSummary } from "./temporal-decay-job";

// Phase 3 — Step 3.2: Event-driven trigger utility
export {
    triggerSkillRecalculation,
    tagsFromQuestion,
} from "./trigger-skill-recalculation";

export type {
    SkillTriggerType,
    SkillTriggerPriority,
    TriggerSkillRecalculationOptions,
} from "./trigger-skill-recalculation";

// Phase 6 — Step 6.1: Tag expert registry builder
export {
    buildRegistryForTag,
    buildFullRegistry,
} from "./registry-builder";

export type { RegistryBuildSummary } from "./registry-builder";

// Phase 6 — Step 6.2: Scheduled rebuild job
export {
    registryRebuildJobHandler,
    runRegistryRebuildJob,
} from "./registry-rebuild-job";

// Phase 6 — Step 6.3: Tier-change registry hook
export { triggerRegistryRebuildOnTierChange } from "./registry-tier-change-hook";
