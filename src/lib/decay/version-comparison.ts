import { extractMajorVersion } from "./registry-fetchers/parse-version";
import type { CachedRelease } from "./package-release-cache-repository";

export type VersionComparison = {
  majorVersionsBehind: number | null;
  isMinorVersionBehindOnly: boolean;
};

/**
 * Compares an answer's versionMax against the cached latest release for its
 * package. Returns nulls/false when comparison isn't possible (unparseable
 * version) — the formula treats that the same as "no version tag" (Decision 3).
 */
export function compareVersion(versionMax: string, cached: CachedRelease): VersionComparison {
  const answerMajor = extractMajorVersion(versionMax);
  if (answerMajor === null) {
    return { majorVersionsBehind: null, isMinorVersionBehindOnly: false };
  }

  const majorVersionsBehind = Math.max(0, cached.latestMajorVersion - answerMajor);

  // Same major, but the registry's latest version string differs from the
  // answer's exact versionMax — treat as "a newer minor/patch exists."
  const isMinorVersionBehindOnly =
    majorVersionsBehind === 0 && cached.latestVersion.trim() !== versionMax.trim();

  return { majorVersionsBehind, isMinorVersionBehindOnly };
}
