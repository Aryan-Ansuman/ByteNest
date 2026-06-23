/**
 * Step 6.11 — Community engagement scoring.
 * Formula: (votes_normalized) × (accepted_answer_factor)
 * Bounded [0, 1]. Derived entirely from existing questions collection fields.
 */

export type CommunityContext = {
  voteCount: number;
  hasAcceptedAnswer: boolean;
};

const ACCEPTED_ANSWER_FACTOR = 1.0;
const NO_ACCEPTED_ANSWER_FACTOR = 0.5;

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

  return parseFloat((voteFactor * answerFactor).toFixed(4));
}

/**
 * Extracts maxVotesInSet from the candidate batch.
 * Called once before scoring the full batch.
 */
export function getMaxVotes(candidates: CommunityContext[]): number {
  return Math.max(0, ...candidates.map((c) => Math.max(0, c.voteCount)));
}
