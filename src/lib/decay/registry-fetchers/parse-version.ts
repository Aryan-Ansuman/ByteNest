/**
 * Extracts the leading major integer from a freeform version string.
 * Tolerant of common prefixes/formats seen across registries: "v18.3.0",
 * "18.3.0", "18.3", "2024.1.0" (calver), "1.0.0-beta.1". No semver
 * dependency — Decision 1 deliberately avoided needing one.
 */
export function extractMajorVersion(version: string): number | null {
  const match = version.trim().match(/^v?(\d+)(?:\.\d+)?(?:\.\d+)?/);
  if (!match) return null;
  const major = parseInt(match[1], 10);
  return Number.isFinite(major) ? major : null;
}
