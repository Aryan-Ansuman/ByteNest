import { GithubApiError } from "./types";
import type { ParsedPrUrl } from "./types";

const PR_URL_PATTERN =
  /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)\/?(?:[/?#].*)?$/;

export function parsePrUrl(url: string): ParsedPrUrl {
  const trimmed = url.trim();
  if (!trimmed) throw new GithubApiError("Paste a GitHub PR URL to continue.", "invalid_url");

  let normalized = trimmed;
  if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
  if (!/^https:\/\//i.test(normalized)) {
    throw new GithubApiError("The URL must use https:// — GitHub doesn't serve plain http.", "invalid_url");
  }

  const match = normalized.match(PR_URL_PATTERN);
  if (!match) {
    throw new GithubApiError(
      "That doesn't look like a GitHub PR URL. Expected format: https://github.com/{owner}/{repo}/pull/{number}",
      "invalid_url"
    );
  }

  const [, owner, repoNameRaw, prNumberRaw] = match;
  const repoName = repoNameRaw.replace(/\.git$/i, "");
  const prNumber = Number.parseInt(prNumberRaw, 10);
  if (!Number.isFinite(prNumber) || prNumber <= 0) {
    throw new GithubApiError("The PR number in that URL isn't valid.", "invalid_url");
  }

  return { owner, repoName, prNumber };
}

/** Canonical form used as the dedup key across the feature — same input, same string. */
export function toCanonicalPrUrl({ owner, repoName, prNumber }: ParsedPrUrl): string {
    return `https://github.com/${owner}/${repoName}/pull/${prNumber}`;
}
