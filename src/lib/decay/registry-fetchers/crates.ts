import { RegistryFetchError } from "./types";
import { extractMajorVersion } from "./parse-version";
import type { NormalizedRelease, ReleaseHistoryEntry } from "./types";

const FETCH_TIMEOUT_MS = 8_000;

// crates.io policy requires an identifying User-Agent — anonymous/generic
// UAs get rate-limited or blocked outright.
const USER_AGENT = "ByteNest-DecaySystem (https://github.com/bytenest; contact: support@bytenest.dev)";

export async function fetchCratesRelease(packageName: string): Promise<NormalizedRelease> {
  const encoded = encodeURIComponent(packageName);

  let response: Response;
  try {
    response = await fetchWithTimeout(`https://crates.io/api/v1/crates/${encoded}/versions`, {
      headers: { "User-Agent": USER_AGENT },
    });
  } catch (err) {
    throw new RegistryFetchError(`crates.io request failed for ${packageName}`, "crates", packageName, err);
  }

  if (!response.ok) {
    throw new RegistryFetchError(`crates.io returned ${response.status} for ${packageName}`, "crates", packageName);
  }

  const data = await response.json().catch((err) => {
    throw new RegistryFetchError(`crates.io returned malformed JSON for ${packageName}`, "crates", packageName, err);
  });

  const versions: Array<{ num: string; created_at: string; yanked?: boolean }> | undefined = data?.versions;
  if (!versions || versions.length === 0) {
    throw new RegistryFetchError(`crates.io response missing versions for ${packageName}`, "crates", packageName);
  }

  // Yanked versions are withdrawn — never treat one as "latest", but they
  // can still appear in history for context.
  const nonYanked = versions.filter((v) => !v.yanked);
  if (nonYanked.length === 0) {
    throw new RegistryFetchError(`All versions of ${packageName} are yanked on crates.io`, "crates", packageName);
  }

  // crates.io returns versions newest-first already, but sort explicitly —
  // the API doesn't formally guarantee ordering.
  const sorted = [...nonYanked].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const latest = sorted[0];
  const latestMajorVersion = extractMajorVersion(latest.num);
  if (latestMajorVersion === null) {
    throw new RegistryFetchError(`Could not parse major version from "${latest.num}"`, "crates", packageName);
  }

  const releaseHistory: ReleaseHistoryEntry[] = sorted
    .slice(0, 10)
    .map((v) => ({ version: v.num, date: new Date(v.created_at).toISOString() }));

  return {
    latestVersion: latest.num,
    latestMajorVersion,
    latestReleaseDate: new Date(latest.created_at).toISOString(),
    releaseHistory,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
