import { RegistryFetchError } from "./types";
import { extractMajorVersion } from "./parse-version";
import type { NormalizedRelease, ReleaseHistoryEntry } from "./types";

const FETCH_TIMEOUT_MS = 8_000;

export async function fetchPypiRelease(packageName: string): Promise<NormalizedRelease> {
  const encoded = encodeURIComponent(packageName);

  let response: Response;
  try {
    response = await fetchWithTimeout(`https://pypi.org/pypi/${encoded}/json`);
  } catch (err) {
    throw new RegistryFetchError(`PyPI request failed for ${packageName}`, "pypi", packageName, err);
  }

  if (!response.ok) {
    throw new RegistryFetchError(`PyPI returned ${response.status} for ${packageName}`, "pypi", packageName);
  }

  const data = await response.json().catch((err) => {
    throw new RegistryFetchError(`PyPI returned malformed JSON for ${packageName}`, "pypi", packageName, err);
  });

  const latestVersion: string | undefined = data?.info?.version;
  const releases: Record<string, Array<{ upload_time_iso_8601?: string; upload_time?: string }>> | undefined =
    data?.releases;

  if (!latestVersion || !releases) {
    throw new RegistryFetchError(`PyPI response missing info.version/releases for ${packageName}`, "pypi", packageName);
  }

  const latestMajorVersion = extractMajorVersion(latestVersion);
  if (latestMajorVersion === null) {
    throw new RegistryFetchError(`Could not parse major version from "${latestVersion}"`, "pypi", packageName);
  }

  // Each release version can have multiple uploaded files (wheel, sdist,
  // per-platform) — take the earliest upload time for that version as its
  // release date.
  const releaseHistory: ReleaseHistoryEntry[] = Object.entries(releases)
    .map(([version, files]) => {
      const dates = (files ?? [])
        .map((f) => f.upload_time_iso_8601 ?? f.upload_time)
        .filter((d): d is string => Boolean(d));
      if (dates.length === 0) return null;
      const earliest = dates.sort()[0];
      return { version, date: new Date(earliest).toISOString() };
    })
    .filter((entry): entry is ReleaseHistoryEntry => entry !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  const latestReleaseDate =
    releaseHistory.find((r) => r.version === latestVersion)?.date ??
    releaseHistory[0]?.date ??
    new Date().toISOString();

  return { latestVersion, latestMajorVersion, latestReleaseDate, releaseHistory };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
