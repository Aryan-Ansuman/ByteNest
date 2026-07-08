import crypto from "node:crypto";

/**
 * PR-Linked Q&A — Phase 2/4/7. GitHub webhook signature verification and
 * registration lifecycle (register / deregister / rotate secret).
 *
 * Deliberately its own file, not part of `pr.ts` — `pr.ts` exports
 * `parsePrUrl` for client-side use, and a static `node:crypto` import at
 * module scope there would break the client bundle. This file must only
 * ever be imported from server-only code (API routes, event processors,
 * Appwrite Functions).
 */
export function verifyWebhookSignature(
    rawBody: Buffer,
    signatureHeader: string | null | undefined,
    secret: string
): boolean {
    if (!signatureHeader || !secret || rawBody.length === 0) return false;

    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    const expectedBuffer = Buffer.from(expected, "utf8");
    const providedBuffer = Buffer.from(signatureHeader, "utf8");

    // Buffers of differing length would throw inside timingSafeEqual —
    // check first, still without a meaningfully length-sensitive early exit
    // (both branches do a fixed amount of work before returning).
    if (expectedBuffer.length !== providedBuffer.length) return false;

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

function githubHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

export type RegisterWebhookResult =
    | { ok: true; githubWebhookId: number }
    | { ok: false; reason: "no_permission" | "error"; message: string };

/**
 * POST /repos/{owner}/{repo}/hooks — subscribes to `pull_request` events
 * only (Decision 4). Returns a structured failure rather than throwing for
 * the "no permission" case — that's an expected, common outcome for repos
 * ByteNest doesn't administer, not an exceptional one.
 */
export async function registerWebhook(
    owner: string,
    repoName: string,
    webhookUrl: string,
    secret: string
): Promise<RegisterWebhookResult> {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/hooks`, {
            method: "POST",
            headers: { ...githubHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({
                name: "web",
                active: true,
                events: ["pull_request"],
                config: {
                    url: webhookUrl,
                    content_type: "json",
                    secret,
                    insecure_ssl: "0",
                },
            }),
        });

        if (response.status === 403 || response.status === 404) {
            // 404 here (as opposed to the PR-lookup 404) almost always means
            // "you don't have admin rights on this repo" rather than "repo
            // doesn't exist" — we already know the repo exists from the
            // metadata fetch that ran before this.
            return { ok: false, reason: "no_permission", message: "No permission to register a webhook on this repository." };
        }

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            return { ok: false, reason: "error", message: `GitHub returned ${response.status} registering the webhook: ${body}` };
        }

        const data: any = await response.json();
        return { ok: true, githubWebhookId: data.id };
    } catch (err: any) {
        return { ok: false, reason: "error", message: err?.message || "Network error registering webhook" };
    }
}

/** DELETE /repos/{owner}/{repo}/hooks/{hookId} — a 404 (already gone) is treated as success. */
export async function deregisterWebhook(owner: string, repoName: string, githubWebhookId: number): Promise<boolean> {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/hooks/${githubWebhookId}`, {
            method: "DELETE",
            headers: githubHeaders(),
        });
        return response.ok || response.status === 404;
    } catch {
        return false;
    }
}

/** PATCH /repos/{owner}/{repo}/hooks/{hookId} — used by the monthly secret-rotation job. */
export async function updateWebhookSecret(
    owner: string,
    repoName: string,
    githubWebhookId: number,
    newSecret: string
): Promise<boolean> {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repoName}/hooks/${githubWebhookId}`, {
            method: "PATCH",
            headers: { ...githubHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ config: { secret: newSecret, content_type: "json", insecure_ssl: "0" } }),
        });
        return response.ok;
    } catch {
        return false;
    }
}
