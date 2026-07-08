export type ParsedPrUrl = { owner: string; repoName: string; prNumber: number };

export type PrMetadata = {
  title: string;
  status: "open" | "merged" | "closed";
  baseRef: string;
  headRef: string;
  authorHandle: string;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  htmlUrl: string;
  language: string | null; // for Phase 3's tag auto-detection
};

export type WebhookRegistrationResult = { githubWebhookId: number };

export type GithubApiErrorReason =
  | "invalid_url" | "not_found" | "forbidden" | "rate_limited"
  | "diff_too_large" | "signature_mismatch" | "network_error" | "malformed_response";

export class GithubApiError extends Error {
  constructor(
    message: string,
    public readonly reason: GithubApiErrorReason,
    public readonly retryAfterSeconds?: number,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}
