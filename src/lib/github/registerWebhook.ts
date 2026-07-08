import { githubAuthHeaders, githubFetch, throwForGithubError } from "./client";
import { GithubApiError } from "./types";
import type { WebhookRegistrationResult } from "./types";

export async function registerWebhook(
  owner: string, repoName: string, webhookUrl: string, secret: string
): Promise<WebhookRegistrationResult> {
  const url = `https://api.github.com/repos/${owner}/${repoName}/hooks`;

  const response = await githubFetch(url, {
    method: "POST",
    headers: { ...githubAuthHeaders("application/vnd.github+json"), "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "web",
      active: true,
      events: ["pull_request"],
      config: { url: webhookUrl, content_type: "json", secret },
    }),
  });

  if (!response.ok) await throwForGithubError(response, `webhook registration for ${owner}/${repoName}`);

  let raw: { id?: number };
  try {
    raw = await response.json();
  } catch (err) {
    throw new GithubApiError(`GitHub returned malformed JSON when registering the webhook for ${owner}/${repoName}.`, "malformed_response", undefined, err);
  }

  if (typeof raw.id !== "number") {
    throw new GithubApiError(`GitHub's webhook-registration response for ${owner}/${repoName} was missing an id.`, "malformed_response");
  }

  return { githubWebhookId: raw.id };
}
