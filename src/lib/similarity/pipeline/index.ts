export { runRetrievalPipeline } from "./retrievalPipeline";
export type { RetrievalPipelineInput, RetrievalPipelineResult } from "./retrievalPipeline";

export { assembleStage1Candidates } from "./stage1/candidateAssembler";
export { filterByTagOverlap } from "./stage1/tagFilter";
export { filterByTechTerms, extractTechTerms } from "./stage1/techFilter";
export { filterByPopularity } from "./stage1/popularityFilter";

export { runStage2, DEFAULT_WEIGHTS, MINIMUM_HYBRID_THRESHOLD } from "./stage2/hybridScorer";
export type { RankedCandidate, ScoringWeights } from "./stage2/hybridScorer";
export { cosineSimilarity, batchCosineSimilarity } from "./stage2/cosineSimilarity";
export { jaccardSimilarity } from "./stage2/tagScorer";
export { scoreCommunity, getMaxVotes } from "./stage2/communityScorer";
export { getRecencyMultiplier } from "./stage2/recencyMultiplier";
