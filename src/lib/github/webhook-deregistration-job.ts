import { Query } from "node-appwrite";
import { db, githubWebhookRegistrationsCollection, prQuestionMetadataCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { listAllDocuments } from "@/lib/appwrite-pagination";
import { deregisterWebhook } from "./webhook";

/**
 * PR-Linked Q&A — Phase 7.
 *
 * Deliberately a nightly sweep rather than inline on question delete — an
 * inline deregister-on-delete could fail partway (network blip calling
 * GitHub) and leave ByteNest's local record out of sync with what's
 * actually registered on GitHub. A sweep is naturally idempotent: it just
 * checks the current state and reconciles it, run after run.
 */
export async function webhookDeregistrationSweepHandler({
    log,
    error,
}: {
    log: (msg: string) => void;
    error: (msg: string) => void;
}): Promise<{ checked: number; deregistered: number }> {
    // failed_no_permission registrations never had a real GitHub-side hook —
    // nothing to deregister, so only look at the ones that succeeded.
    const { documents: registrations } = await listAllDocuments(githubWebhookRegistrationsCollection, [
        Query.equal("webhookRegistrationStatus", "registered"),
    ]);

    log(`[webhook-deregistration-sweep] Checking ${registrations.length} registered webhook(s)`);

    let deregistered = 0;

    for (const registration of registrations) {
        const owner = registration.repoOwner as string;
        const repoName = registration.repoName as string;
        const githubWebhookId = registration.githubWebhookId as number | null;

        try {
            const remaining = await databases.listDocuments(db, prQuestionMetadataCollection, [
                Query.equal("prRepoOwner", owner),
                Query.equal("prRepoName", repoName),
                Query.limit(1),
            ]);

            if (remaining.total > 0) continue; // Still in use — leave it registered.

            if (githubWebhookId) {
                const ok = await deregisterWebhook(owner, repoName, githubWebhookId);
                if (!ok) {
                    error(`[webhook-deregistration-sweep] Failed to deregister ${owner}/${repoName} on GitHub — will retry next run`);
                    continue; // Leave our record intact so the next sweep retries.
                }
            }

            await databases.deleteDocument(db, githubWebhookRegistrationsCollection, registration.$id);
            deregistered += 1;
            log(`[webhook-deregistration-sweep] Deregistered ${owner}/${repoName} (no PR questions remain)`);
        } catch (err: any) {
            error(`[webhook-deregistration-sweep] Error processing ${owner}/${repoName}: ${err?.message || err}`);
        }
    }

    log(`[webhook-deregistration-sweep] Done — deregistered ${deregistered}/${registrations.length}`);
    return { checked: registrations.length, deregistered };
}
