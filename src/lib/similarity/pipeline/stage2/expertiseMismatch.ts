import { computeAnswerComplexity } from "../nlp/answerComplexity";

// Numeric values used by the future ranking formula
export const TIER_SCORES: Record<string, number> = {
  newcomer:     0.0,
  learner:      0.25,
  intermediate: 0.50,
  advanced:     0.75,
  expert:       1.0,
};

const PENALTY_WEIGHT = 0.10;  // w_expertise in the hybrid formula
const MAX_PENALTY    = 0.15;  // cap to prevent over-penalization

/**
 * Compute the expertise mismatch penalty for one candidate.
 *
 * Penalty is positive (reduces score) when user expertise and
 * answer complexity are mismatched. Zero when matched or unknown.
 */
export function computeExpertiseMismatchPenalty(userTier: string | null, answerBody: string | null | undefined): number {
  if (!userTier || !answerBody) return 0;

  const userScore     = TIER_SCORES[userTier] ?? 0.5;
  const complexity    = computeAnswerComplexity(answerBody);

  // Mismatch magnitude: 0 when aligned, up to 1.0 when maximally opposed
  const mismatch = Math.abs(userScore - complexity);

  // Only penalize meaningful mismatches (> 0.3 apart on the 0–1 scale)
  if (mismatch < 0.3) return 0;

  return Math.min(mismatch * PENALTY_WEIGHT, MAX_PENALTY);
}

/**
 * Resolve the user's expertise tier for the question's primary tag.
 * Uses the first tag that appears in userExpertiseTags, falling back to null.
 */
export function resolveUserTierForQuestion(questionTags: string[], userExpertiseTags?: Record<string, string>): string | null {
  if (!userExpertiseTags || Object.keys(userExpertiseTags).length === 0) return null;

  for (const tag of questionTags) {
    if (userExpertiseTags[tag]) return userExpertiseTags[tag];
  }
  return null;
}
