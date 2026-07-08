import { GithubApiError } from "./types";

const FETCH_TIMEOUT_MS = 8_000;
const GITHUB_API_VERSION = "2022-11-28";

export function githubAuthHeaders(accept: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept, "X-GitHub-Api-Version": GITHUB_API_VERSION };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function githubFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new GithubApiError(`Could not reach GitHub — check your connection and try again.`, "network_error", undefined, err);
  } finally {
    clearTimeout(timeout);
  }
}

export async function throwForGithubError(response: Response, subject: string): Promise<never> {
  const hasToken = Boolean(process.env.GITHUB_TOKEN);

  if (response.status === 404) {
    throw new GithubApiError(
      `${subject} wasn't found. Double-check the URL — it may be a private repo, or the PR may not exist.`,
      "not_found"
    );
  }

  if (response.status === 403) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    if (remaining === "0") {
      throw new GithubApiError(
        `GitHub API rate limit reached${hasToken ? "" : " (no GITHUB_TOKEN set — add one for a much higher limit)"}. Try again in a bit.`,
        "rate_limited",
        secondsUntilReset(response)
      );
    }
    throw new GithubApiError(`No access to this repo. If it's private, make sure GITHUB_TOKEN has access to it.`, "forbidden");
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined;
    throw new GithubApiError(
      `GitHub API rate limit reached. Try again${retryAfterSeconds ? ` in about ${retryAfterSeconds}s` : " shortly"}.`,
      "rate_limited",
      retryAfterSeconds
    );
  }

  throw new GithubApiError(`GitHub returned an unexpected error (${response.status}) for ${subject}.`, "network_error");
}

function secondsUntilReset(response: Response): number | undefined {
  const resetHeader = response.headers.get("x-ratelimit-reset");
  if (!resetHeader) return undefined;
  const resetEpochSeconds = Number.parseInt(resetHeader, 10);
  if (!Number.isFinite(resetEpochSeconds)) return undefined;
  return Math.max(0, resetEpochSeconds - Math.floor(Date.now() / 1000));
}
