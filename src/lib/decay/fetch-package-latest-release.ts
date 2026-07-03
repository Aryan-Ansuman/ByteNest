import { fetchNpmRelease } from "./registry-fetchers/npm";
import { fetchPypiRelease } from "./registry-fetchers/pypi";
import { fetchCratesRelease } from "./registry-fetchers/crates";
import { fetchGithubRelease } from "./registry-fetchers/github";
import { RegistryFetchError } from "./registry-fetchers/types";
import { getCachedRelease, upsertCachedRelease } from "./package-release-cache-repository";
import type { NormalizedRelease } from "./registry-fetchers/types";
import type { TechEcosystem } from "./types";

/**
 * Fetches the latest release info for a package, writing the result to
 * package_release_cache on success. On fetch failure, returns the existing
 * cached value untouched (lastFetchedAt is NOT bumped) — this is a
 * deliberate soft-fail: it effectively extends the cache TTL rather than
 * propagating the error, so one bad night for a flaky registry doesn't
 * corrupt scores for every answer tagged with that package.
 *
 * Returns null only when there's no cached fallback AND the fetch failed —
 * the nightly job (Phase 3) must treat null as "skip this package for
 * tonight, don't crash the batch."
 */
export async function fetchPackageLatestRelease(
  packageName: string,
  ecosystem: TechEcosystem
): Promise<NormalizedRelease | null> {
  try {
    const fresh = await fetchFromRegistry(packageName, ecosystem);
    const existing = await getCachedRelease(packageName, ecosystem);
    await upsertCachedRelease(packageName, ecosystem, fresh, existing?.$id);
    return fresh;
  } catch (err) {
    const reason = err instanceof RegistryFetchError ? err.message : String(err);
    console.error(`[decay] Registry fetch failed for ${ecosystem}:${packageName} — ${reason}`);

    const cached = await getCachedRelease(packageName, ecosystem).catch(() => null);
    if (cached) {
      console.warn(`[decay] Falling back to stale cache for ${ecosystem}:${packageName} (last fetched ${cached.lastFetchedAt})`);
      return cached;
    }

    return null;
  }
}

async function fetchFromRegistry(packageName: string, ecosystem: TechEcosystem): Promise<NormalizedRelease> {
  switch (ecosystem) {
    case "npm":
      return fetchNpmRelease(packageName);
    case "pypi":
      return fetchPypiRelease(packageName);
    case "crates":
      return fetchCratesRelease(packageName);
    case "github":
      return fetchGithubRelease(packageName);
    default: {
      const _exhaustive: never = ecosystem;
      throw new RegistryFetchError(`Unknown ecosystem: ${_exhaustive}`, String(ecosystem), packageName);
    }
  }
}
