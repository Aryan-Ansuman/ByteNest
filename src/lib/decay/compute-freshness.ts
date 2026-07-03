import {
  VERSIONED_HALF_LIFE_MONTHS,
  UNTAGGED_HALF_LIFE_MONTHS,
  VERSION_PENALTY,
  STALENESS_PER_VOTE_PENALTY,
  STALENESS_VOTES_FOR_ZERO,
  FRESHNESS_THRESHOLDS,
} from "./config";
import type { FreshnessInputs, FreshnessResult, FreshnessLabel } from "./types";

export function computeFreshness(inputs: FreshnessInputs): FreshnessResult {
  const halfLife = inputs.isVersionTagged
    ? VERSIONED_HALF_LIFE_MONTHS
    : UNTAGGED_HALF_LIFE_MONTHS;

  const timeMultiplier = Math.pow(0.5, Math.max(0, inputs.ageInMonths) / halfLife);

  const versionPenaltyMultiplier = resolveVersionPenalty(inputs);

  const cappedVotes = Math.min(inputs.stalenessVoteCount, STALENESS_VOTES_FOR_ZERO);
  const stalenessMultiplier = Math.max(0, 1 - cappedVotes * STALENESS_PER_VOTE_PENALTY);

  const rawScore = timeMultiplier * versionPenaltyMultiplier * stalenessMultiplier * 100;
  const freshnessScore = clamp(Math.round(rawScore), 0, 100);

  return {
    timeMultiplier,
    versionPenaltyMultiplier,
    stalenessMultiplier,
    freshnessScore,
    freshnessLabel: labelFor(freshnessScore),
  };
}

function resolveVersionPenalty(inputs: FreshnessInputs): number {
  if (!inputs.isVersionTagged || inputs.majorVersionsBehind === null) {
    return VERSION_PENALTY.NO_PENALTY;
  }
  if (inputs.majorVersionsBehind >= 2) return VERSION_PENALTY.TWO_PLUS_MAJORS_BEHIND;
  if (inputs.majorVersionsBehind === 1) return VERSION_PENALTY.ONE_MAJOR_BEHIND;
  // Same major — only a minor-version penalty applies if the registry has
  // shipped something newer within that major.
  return inputs.isMinorVersionBehindOnly ? VERSION_PENALTY.MINOR_BEHIND : VERSION_PENALTY.NO_PENALTY;
}

function labelFor(score: number): FreshnessLabel {
  const match = FRESHNESS_THRESHOLDS.find((t) => score >= t.min && score <= t.max);
  // FRESHNESS_THRESHOLDS covers the full 0-100 range with no gaps — this
  // fallback only fires if config.ts itself is misconfigured.
  return match?.label ?? "stale";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
