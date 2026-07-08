import { githubAuthHeaders, githubFetch, throwForGithubError } from "./client";
import { GithubApiError } from "./types";
import type { PrMetadata } from "./types";

type RawGithubPullRequest = {
  title?: string;
  state?: "open" | "closed";
  merged?: boolean;
  merged_at?: string | null;
  closed_at?: string | null;
  created_at?: string;
  html_url?: string;
  base?: { ref?: string };
  head?: { ref?: string; repo?: { language?: string | null } | null };
  user?: { login?: string };
};

export async function fetchPrMetadata(owner: string, repoName: string, prNumber: number): Promise<PrMetadata> {
  const url = `https://api.github.com/repos/${owner}/${repoName}/pulls/${prNumber}`;
  const response = await githubFetch(url, { headers: githubAuthHeaders("application/vnd.github+json") });

  if (!response.ok) await throwForGithubError(response, `PR ${owner}/${repoName}#${prNumber}`);

  let raw: RawGithubPullRequest;
  try {
    raw = await response.json();
  } catch (err) {
    throw new GithubApiError(`GitHub returned malformed JSON for PR ${owner}/${repoName}#${prNumber}.`, "malformed_response", undefined, err);
  }

  if (!raw.title || !raw.state || !raw.base?.ref || !raw.head?.ref || !raw.user?.login || !raw.created_at || !raw.html_url) {
    throw new GithubApiError(`GitHub's response for PR ${owner}/${repoName}#${prNumber} was missing expected fields.`, "malformed_response");
  }

  const status: PrMetadata["status"] = raw.state === "open" ? "open" : raw.merged ? "merged" : "closed";

  return {
    title: raw.title,
    status,
    baseRef: raw.base.ref,
    headRef: raw.head.ref,
    authorHandle: raw.user.login,
    createdAt: raw.created_at,
    mergedAt: raw.merged_at ?? null,
    closedAt: raw.closed_at ?? null,
    htmlUrl: raw.html_url,
    language: raw.head.repo?.language ?? null,
  };
}
