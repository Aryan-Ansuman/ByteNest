// Temporal Answer Decay System — Decision 3, the formula contract.
//
// Locked here so the nightly job (Phase 3), the UI badges (Phase 6), and
// the staleness vote recompute path (Phase 5) all read from the exact same
// numbers. Nothing in this system should hardcode these values anywhere
// else — always import from this file.

// ─── Time multiplier ────────────────────────────────────────────────────
// timeMultiplier = 0.5 ^ (ageInMonths / halfLifeMonths)
export const VERSIONED_HALF_LIFE_MONTHS = 18;
export const UNTAGGED_HALF_LIFE_MONTHS = 36;

// ─── Version penalty multiplier ─────────────────────────────────────────
// Only applied when versionMax + techPackage + techEcosystem are all set
// and the package is in the tech_package_map. Untagged answers always use
// NO_PENALTY (1.0) — time decay is the only signal available for them.
export const VERSION_PENALTY = {
  NO_PENALTY: 1.0,          // versionMax not set, or package not in the map
  MINOR_BEHIND: 0.9,        // same major, package has newer minor/patch releases
  ONE_MAJOR_BEHIND: 0.7,
  TWO_PLUS_MAJORS_BEHIND: 0.4,
} as const;

// ─── Staleness vote multiplier ──────────────────────────────────────────
// stalenessMultiplier = max(0, 1 - stalenessVoteCount * PER_VOTE_PENALTY)
export const STALENESS_PER_VOTE_PENALTY = 0.15;
export const STALENESS_VOTES_FOR_ZERO = 6; // 6 * 0.15 = 0.9, so this is also where the formula naturally floors

// ─── Score → label thresholds ───────────────────────────────────────────
// Order matters: evaluated top-down, first match wins.
export const FRESHNESS_THRESHOLDS = [
  { min: 80, max: 100, label: "fresh" as const },
  { min: 50, max: 79, label: "aging" as const },
  { min: 20, max: 49, label: "outdated" as const },
  { min: 0, max: 19, label: "stale" as const },
];

// ─── Decision 4 — recompute cadence ─────────────────────────────────────
export const PACKAGE_CACHE_TTL_HOURS = 23;
export const NIGHTLY_JOB_CRON = "0 2 * * *"; // 02:00 UTC, sequenced after tag-expert-registry rebuild

// ─── Author "Still valid" confirmation ──────────────────────────────────
export const AUTHOR_VERIFICATION_SUPPRESSION_DAYS = 90;

// ─── Notification throttle ───────────────────────────────────────────────
export const NOTIFICATION_RETHROTTLE_DAYS = 30;

// ─── Staleness vote eligibility ─────────────────────────────────────────
// Prevents throwaway accounts from tanking a good answer's freshness score.
// Chosen to be low enough that any genuinely active user clears it, high
// enough that a brand-new account can't.
export const MIN_REPUTATION_FOR_STALENESS_VOTE = 15;
