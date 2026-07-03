import { RegistryFetchError } from "./types";
import { extractMajorVersion } from "./parse-version";
import type { NormalizedRelease, ReleaseHistoryEntry } from "./types";

const FETCH_TIMEOUT_MS = 8_000;

/**
 * `packageName` for the github ecosystem is expected in "owner/repo" form
 * (matches what's seeded in tech_package_map, e.g. "golang/go").
 */
export async function fetchGithubRelease(packageName: string): Promise<NormalizedRelease> {
  if (!packageName.includes("/")) {
    throw new RegistryFetchError(
      `GitHub package name must be "owner/repo", got "${packageName}"`,
      "github",
      packageName
    );
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  // Latest single release first — cheap, one call, covers the formula's
  // actual need (latestVersion + latestMajorVersion + latestReleaseDate).
  let latestResponse: Response;
  try {
    latestResponse = await fetchWithTimeout(
      `https://api.github.com/repos/${packageName}/releases/latest`,
      { headers }
    );
  } catch (err) {
    throw new RegistryFetchError(`GitHub request failed for ${packageName}`, "github", packageName, err);
  }

  if (!latestResponse.ok) {
    throw new RegistryFetchError(
      `GitHub returned ${latestResponse.status} for ${packageName}${
        !token ? " (no GITHUB_TOKEN set — likely rate-limited)" : ""
      }`,
      "github",
      packageName
    );
  }

  const latest = await latestResponse.json().catch((err) => {
    throw new RegistryFetchError(`GitHub returned malformed JSON for ${packageName}`, "github", packageName, err);
  });

  const latestVersion: string | undefined = latest?.tag_name;
  const latestReleaseDate: string | undefined = latest?.published_at ?? latest?.created_at;

  if (!latestVersion || !latestReleaseDate) {
    throw new RegistryFetchError(`GitHub response missing tag_name/published_at for ${packageName}`, "github", packageName);
  }

  const latestMajorVersion = extractMajorVersion(latestVersion);
  if (latestMajorVersion === null) {
    throw new RegistryFetchError(`Could not parse major version from "${latestVersion}"`, "github", packageName);
  }

  // History is a second, best-effort call — a failure here still returns a
  // usable result with a single-entry history rather than failing the whole fetch.
  let releaseHistory: ReleaseHistoryEntry[] = [{ version: latestVersion, date: latestReleaseDate }];
  try {
    const historyResponse = await fetchWithTimeout(
      `https://api.github.com/repos/${packageName}/releases?per_page=10`,
      { headers }
    );
    if (historyResponse.ok) {
      const releases: Array<{ tag_name: string; published_at?: string; created_at: string }> =
        await historyResponse.json();
      releaseHistory = releases
        .slice(0, 10)
        .map((r) => ({ version: r.tag_name, date: r.published_at ?? r.created_at }));
    }
  } catch {
    // Best-effort — keep the single-entry fallback from above.
  }

  return { latestVersion, latestMajorVersion, latestReleaseDate, releaseHistory };
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
