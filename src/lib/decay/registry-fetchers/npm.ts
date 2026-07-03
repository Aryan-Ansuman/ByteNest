import { RegistryFetchError } from "./types";
import { extractMajorVersion } from "./parse-version";
import type { NormalizedRelease, ReleaseHistoryEntry } from "./types";

const FETCH_TIMEOUT_MS = 8_000;

export async function fetchNpmRelease(packageName: string): Promise<NormalizedRelease> {
  const encoded = encodeURIComponent(packageName).replace("%40", "@"); // scoped packages keep their leading @

  let response: Response;
  try {
    response = await fetchWithTimeout(`https://registry.npmjs.org/${encoded}`, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch (err) {
    throw new RegistryFetchError(`npm request failed for ${packageName}`, "npm", packageName, err);
  }

  if (!response.ok) {
    throw new RegistryFetchError(`npm returned ${response.status} for ${packageName}`, "npm", packageName);
  }

  const data = await response.json().catch((err) => {
    throw new RegistryFetchError(`npm returned malformed JSON for ${packageName}`, "npm", packageName, err);
  });

  const latestVersion: string | undefined = data?.["dist-tags"]?.latest;
  const time: Record<string, string> | undefined = data?.time;

  if (!latestVersion || !time) {
    throw new RegistryFetchError(`npm response missing dist-tags/time for ${packageName}`, "npm", packageName);
  }

  const latestMajorVersion = extractMajorVersion(latestVersion);
  if (latestMajorVersion === null) {
    throw new RegistryFetchError(`Could not parse major version from "${latestVersion}"`, "npm", packageName);
  }

  const latestReleaseDate = time[latestVersion] ?? new Date().toISOString();

  // `time` includes "created"/"modified" meta-keys alongside actual
  // versions — filter those out before building history.
  const releaseHistory: ReleaseHistoryEntry[] = Object.entries(time)
    .filter(([version]) => version !== "created" && version !== "modified")
    .map(([version, date]) => ({ version, date }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

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
