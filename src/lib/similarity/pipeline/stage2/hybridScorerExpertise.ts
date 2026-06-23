import { computeExpertiseMismatchPenalty, resolveUserTierForQuestion } from './expertiseMismatch';
import { generateExplanationTokens } from './explanationTokens';
import { cosineSimilarity } from './cosineSimilarity';
import { computeIntentSimilarity } from './intentScorer';
import { jaccardSimilarity } from './tagScorer';
import { computeCommunityScore } from './communityScorer';
import { applyRecencyMultiplier } from './recencyMultiplier';
import { getActiveWeights } from '../../feedback/getActiveWeights';
import type { TagFilterCandidate } from '../stage1/tagFilter';
import type { CandidateIntentContext } from './intentScorer';

// Note: Requires wExpertise to be added to ScoringWeights when activated
export async function runStage2HybridRankingWithExpertise(params: {
  sourceVector: number[];
  sourceTitle: string;
  sourceTags: string[];
  candidates: TagFilterCandidate[];
  intentContexts: Map<string, CandidateIntentContext>;
  userId: string | null;
  userExpertiseTags?: Record<string, string>;
  weights?: any;
  threshold?: number;
}) {
  const {
    sourceVector,
    sourceTitle,
    sourceTags,
    candidates,
    intentContexts,
    userId,
    userExpertiseTags,
  } = params;

  const activeConfig = await getActiveWeights();
  const weights = params.weights ?? activeConfig;
  const threshold = params.threshold ?? activeConfig.threshold;

  const userTier = resolveUserTierForQuestion(sourceTags, userExpertiseTags);
  const results = [];

  for (const candidate of candidates) {
    const semantic  = cosineSimilarity(sourceVector, candidate.embeddingVector);
    const intent    = computeIntentSimilarity({ title: sourceTitle, tags: sourceTags }, candidate.questionId, intentContexts);
    const tag       = jaccardSimilarity(sourceTags, candidate.tags);
    const community = computeCommunityScore(candidate);

    // ── Fifth signal: expertise mismatch penalty ─────────────────────────
    const expertisePenalty = computeExpertiseMismatchPenalty(
      userTier,
      (candidate as any).acceptedAnswerBody ?? null // Needs Stage 1 updates upon activation
    );
    // ─────────────────────────────────────────────────────────────────────

    const hybrid =
      semantic        * weights.semantic   +
      intent          * weights.intent     +
      tag             * weights.tag        +
      community       * weights.community  -
      expertisePenalty;                      // subtracted, not added

    const recency = applyRecencyMultiplier(hybrid, candidate.createdAt);

    const scores = { semantic, intent, tag, community, expertisePenalty, hybrid: recency };

    const explanationTokens = generateExplanationTokens(
      { semantic, tagJaccard: tag, intentMatch: intent > 0, intentConfidence: 0.8 },
      candidate,
      { userTier, expertisePenalty }
    );

    results.push({ ...candidate, scores, explanationTokens });
  }

  return results
    .filter(r => r.scores.hybrid >= threshold)
    .sort((a, b) => b.scores.hybrid - a.scores.hybrid);
}
