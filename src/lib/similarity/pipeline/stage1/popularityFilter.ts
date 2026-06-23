import type { TagFilterCandidate } from "./tagFilter";

/**
 * Step 6.4 — Popularity filtering.
 * Excludes questions with negative total votes.
 * Negatively voted questions are poor duplicate targets — community signal.
 */
export function filterByPopularity(
  candidates: TagFilterCandidate[]
): TagFilterCandidate[] {
  return candidates.filter((c) => c.voteCount >= 0);
}
