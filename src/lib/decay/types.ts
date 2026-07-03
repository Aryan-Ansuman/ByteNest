// Temporal Answer Decay System — shared types.
//
// Decision 1: version metadata lives on the ANSWER, not the question.
// Only the answerer can authoritatively say what version range their
// solution applies to; the question's tags are a pre-fill suggestion only,
// never the source of truth.

export const TECH_ECOSYSTEMS = ["npm", "pypi", "crates", "github"] as const;
export type TechEcosystem = (typeof TECH_ECOSYSTEMS)[number];

export const FRESHNESS_LABELS = ["fresh", "aging", "outdated", "stale"] as const;
export type FreshnessLabel = (typeof FRESHNESS_LABELS)[number];

// Decision 1 — freeform version strings, not structured semver. The nightly
// job only ever needs the leading major integer out of versionMax; no
// semver parsing dependency required anywhere in this system.
export type VersionRange = {
  versionMin: string | null; // e.g. "16.0" — informational only, not used by the formula
  versionMax: string | null; // e.g. "18.3" — compared against the package's current latest major
};

export type TechTag = {
  techPackage: string | null;    // canonical registry package name, e.g. "react", "Django", "tokio"
  techEcosystem: TechEcosystem | null;
};

// Decision 2 — tag → package resolution. Deliberately its own record shape
// rather than folded into `technology_terms` (which drives alias-matching
// for the similarity engine — a different concern with different
// cardinality and update cadence). Stored in Appwrite, not a static JSON
// file, so it's editable via a script or an internal admin route without a
// redeploy.
export type TechPackageMapping = {
  tag: string;              // lowercased question tag, e.g. "react"
  ecosystem: TechEcosystem;
  packageName: string;      // exact registry package name, e.g. "React" tag -> "react" npm package
};

// Decision 3 — freshness score inputs. Every multiplier is [0, 1];
// freshnessScore = round(product of all three * 100), clamped [0, 100].
export type FreshnessInputs = {
  ageInMonths: number;
  isVersionTagged: boolean;        // whether versionMax + techPackage + techEcosystem are all set
  majorVersionsBehind: number | null; // null when isVersionTagged is false
  isMinorVersionBehindOnly: boolean;  // true when same major, but a minor/patch release exists
  stalenessVoteCount: number;
};

export type FreshnessResult = {
  timeMultiplier: number;
  versionPenaltyMultiplier: number;
  stalenessMultiplier: number;
  freshnessScore: number; // 0-100 integer
  freshnessLabel: FreshnessLabel;
};
