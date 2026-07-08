import { ID, Query } from "node-appwrite";
import { db, githubWebhookRegistrationsCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { registerWebhook } from "./webhook";
import { getActiveSecrets } from "./webhook-secret";

/**
 * PR-Linked Q&A — Phase 7.
 *
 * Called right after a PR question's diff is fetched and stored (same
 * background job, per spec — not a separate event). Registers ByteNest's
 * webhook for (owner, repoName) exactly once; every subsequent PR question
 * against the same repo is a no-op lookup.
 */
export async function ensureWebhookRegistered(owner: string, repoName: string): Promise<void> {
    const existing = await databases.listDocuments(db, githubWebhookRegistrationsCollection, [
        Query.equal("repoOwner", owner),
        Query.equal("repoName", repoName),
        Query.limit(1),
    ]);
    if (existing.total > 0) return; // Already registered (or already known to fail) — skip.

    const baseUrl = process.env.BASE_URL;
    if (!baseUrl) {
        // No publicly reachable URL configured (e.g. local dev without a
        // tunnel) — nothing to register against yet. Don't write a
        // registration record at all, so this is retried on the next PR
        // question against this repo once BASE_URL is set.
        console.warn(
            `[ensureWebhookRegistered] BASE_URL is not set — skipping webhook registration for ${owner}/${repoName}`
        );
        return;
    }

    const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/webhooks/github`;
    const { current: secret } = await getActiveSecrets();

    const result = await registerWebhook(owner, repoName, webhookUrl, secret);
    const now = new Date().toISOString();

    // Doc ID is auto-generated (ID.unique()) — owner/repoName combined can
    // exceed Appwrite's 36-char custom-ID limit for longer names. Uniqueness
    // is instead enforced by the collection's (repoOwner, repoName) index;
    // a 409 here just means a concurrent request for the same repo won the
    // race, which is fine to ignore.
    const writeRegistration = (fields: Record<string, unknown>) =>
        databases.createDocument(db, githubWebhookRegistrationsCollection, ID.unique(), fields).catch((err: any) => {
            if (err?.code !== 409) throw err;
        });

    if (result.ok) {
        await writeRegistration({
            repoOwner: owner,
            repoName,
            githubWebhookId: result.githubWebhookId,
            webhookRegistrationStatus: "registered",
            registeredAt: now,
            lastEventAt: null,
        });
        return;
    }

    if (result.reason === "no_permission") {
        await writeRegistration({
            repoOwner: owner,
            repoName,
            githubWebhookId: null,
            webhookRegistrationStatus: "failed_no_permission",
            registeredAt: now,
            lastEventAt: null,
        });
        return;
    }

    // Transient/unexpected GitHub error — don't write a record, so a future
    // PR question against this repo retries registration instead of being
    // permanently (and incorrectly) marked as failed.
    console.error(`[ensureWebhookRegistered] Failed to register webhook for ${owner}/${repoName}: ${result.message}`);
}
