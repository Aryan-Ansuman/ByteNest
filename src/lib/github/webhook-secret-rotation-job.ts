import { Query } from "node-appwrite";
import { githubWebhookRegistrationsCollection } from "@/models/name";
import { listAllDocuments } from "@/lib/appwrite-pagination";
import { updateWebhookSecret } from "./webhook";
import { rotateSecret } from "./webhook-secret";

/**
 * PR-Linked Q&A — Phase 7 monthly secret rotation.
 *
 * Rotates the DB-backed secret first (so the webhook route immediately
 * starts accepting the new secret, with the old one still valid for 24h —
 * see webhook-secret.ts for why this lives in the DB rather than
 * mutating GITHUB_WEBHOOK_SECRET), then pushes the new secret out to every
 * registered GitHub webhook. A single repo's PATCH failing doesn't block
 * the others, and doesn't undo the rotation — the 24h overlap window
 * covers repos GitHub hasn't been updated on yet.
 */
export async function webhookSecretRotationHandler({
    log,
    error,
}: {
    log: (msg: string) => void;
    error: (msg: string) => void;
}): Promise<{ rotated: boolean; updated: number; failed: number }> {
    const { newSecret } = await rotateSecret();
    log("[webhook-secret-rotation] Rotated secret — pushing to registered webhooks");

    const { documents: registrations } = await listAllDocuments(githubWebhookRegistrationsCollection, [
        Query.equal("webhookRegistrationStatus", "registered"),
    ]);

    let updated = 0;
    let failed = 0;

    for (const registration of registrations) {
        const owner = registration.repoOwner as string;
        const repoName = registration.repoName as string;
        const githubWebhookId = registration.githubWebhookId as number | null;
        if (!githubWebhookId) continue;

        const ok = await updateWebhookSecret(owner, repoName, githubWebhookId, newSecret);
        if (ok) {
            updated += 1;
        } else {
            failed += 1;
            error(
                `[webhook-secret-rotation] Failed to push new secret to ${owner}/${repoName} — ` +
                    `it will keep sending with the old secret, which stays valid for 24h`
            );
        }
    }

    log(`[webhook-secret-rotation] Done — updated ${updated}/${registrations.length}, failed ${failed}`);
    return { rotated: true, updated, failed };
}
