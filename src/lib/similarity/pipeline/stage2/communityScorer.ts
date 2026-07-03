/**
 * Step 6.11 — Community engagement scoring.
 * Formula: (votes_normalized) × (accepted_answer_factor) × (verified_answer_factor)
 * Bounded [0, 1]. Derived entirely from existing questions collection fields.
 */

export type CommunityContext = {
  voteCount: number;
  hasAcceptedAnswer: boolean;
  hasVerifiedAnswer: boolean; // TVA — Phase 7
};

const ACCEPTED_ANSWER_FACTOR = 1.0;
const NO_ACCEPTED_ANSWER_FACTOR = 0.5;

// TVA — a machine-verified question is a higher-confidence training signal
// for "this problem has a confirmed correct answer" than a crowd-accepted
// one. Small, multiplicative nudge rather than a separate weight bucket —
// keeps the existing hybrid formula untouched.
const VERIFIED_ANSWER_BONUS = 1.15;

/**
 * Scores a single candidate.
 * Requires maxVotesInSet to normalize vote counts across the candidate batch.
 */
export function scoreCommunity(
  candidate: CommunityContext,
  maxVotesInSet: number
): number {
  const clampedVotes = Math.max(0, candidate.voteCount);
  const voteFactor = maxVotesInSet > 0 ? clampedVotes / maxVotesInSet : 0;
  const answerFactor = candidate.hasAcceptedAnswer
    ? ACCEPTED_ANSWER_FACTOR
    : NO_ACCEPTED_ANSWER_FACTOR;
  const verifiedFactor = candidate.hasVerifiedAnswer ? VERIFIED_ANSWER_BONUS : 1.0;

  const score = voteFactor * answerFactor * verifiedFactor;
  return parseFloat(Math.min(1, score).toFixed(4)); // re-clamp — the bonus can push above 1
}

/**
 * Extracts maxVotesInSet from the candidate batch.
 * Called once before scoring the full batch.
 */
export function getMaxVotes(candidates: CommunityContext[]): number {
  return Math.max(0, ...candidates.map((c) => Math.max(0, c.voteCount)));
}
