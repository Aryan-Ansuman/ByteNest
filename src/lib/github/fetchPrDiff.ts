import { githubAuthHeaders, githubFetch, throwForGithubError } from "./client";
import { GithubApiError } from "./types";

const MAX_DIFF_BYTES = 2 * 1024 * 1024; // 2MB

export async function fetchPrDiff(owner: string, repoName: string, prNumber: number): Promise<string> {
  const url = `https://api.github.com/repos/${owner}/${repoName}/pulls/${prNumber}`;
  const response = await githubFetch(url, { headers: githubAuthHeaders("application/vnd.github.v3.diff") });

  if (!response.ok) await throwForGithubError(response, `diff for PR ${owner}/${repoName}#${prNumber}`);

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_DIFF_BYTES) {
    throw new GithubApiError(`The diff for PR ${owner}/${repoName}#${prNumber} is too large (over 2MB) to use here.`, "diff_too_large");
  }

  const diffText = await response.text();

  if (new TextEncoder().encode(diffText).length > MAX_DIFF_BYTES) {
    throw new GithubApiError(`The diff for PR ${owner}/${repoName}#${prNumber} is too large (over 2MB) to use here.`, "diff_too_large");
  }

  return diffText;
}
