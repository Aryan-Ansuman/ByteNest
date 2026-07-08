import crypto from "node:crypto";
import { db, webhookSecretStateCollection, WEBHOOK_SECRET_STATE_DOC_ID } from "@/models/name";
import { databases } from "@/models/server/config";

/**
 * PR-Linked Q&A — Phase 7 secret rotation.
 *
 * A running Next.js server can't rewrite its own `GITHUB_WEBHOOK_SECRET`
 * env var — that lives in the hosting platform's config, and rotating it
 * from inside the app would require a platform-specific API (Vercel,
 * Railway, ...) that's out of scope here. What a running server *can* do
 * is write to its own database, so once rotation needs to happen on a
 * schedule, the DB — not the env var — becomes the source of truth for
 * "what secret(s) are currently valid." The env var is only ever read as
 * the bootstrap value, before the first rotation has run.
 */

export type ActiveSecrets = {
    current: string;
    /** Still accepted for a 24h overlap window after a rotation, then ignored. */
    previous: string | null;
};

export async function getActiveSecrets(): Promise<ActiveSecrets> {
    const envSecret = process.env.GITHUB_WEBHOOK_SECRET || "";

    try {
        const doc = await databases.getDocument(db, webhookSecretStateCollection, WEBHOOK_SECRET_STATE_DOC_ID);
        const previousStillValid =
            typeof doc.previousSecret === "string" &&
            typeof doc.previousSecretExpiresAt === "number" &&
            doc.previousSecretExpiresAt > Date.now();

        return {
            current: (doc.currentSecret as string) || envSecret,
            previous: previousStillValid ? (doc.previousSecret as string) : null,
        };
    } catch {
        // No rotation has ever run — env var is the only secret in play.
        return { current: envSecret, previous: null };
    }
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Rotates the active secret, keeping the old one valid for a 24h overlap
 * window (spec: "the webhook endpoint must handle a short overlap period
 * where the old secret is still valid"). Bootstraps from the env var on
 * the very first call if no state document exists yet.
 */
export async function rotateSecret(): Promise<{ newSecret: string; previousSecret: string }> {
    const { current: previousSecret } = await getActiveSecrets();
    const newSecret = crypto.randomBytes(32).toString("hex");

    await databases
        .updateDocument(db, webhookSecretStateCollection, WEBHOOK_SECRET_STATE_DOC_ID, {
            currentSecret: newSecret,
            previousSecret,
            previousSecretExpiresAt: Date.now() + TWENTY_FOUR_HOURS_MS,
            rotatedAt: new Date().toISOString(),
        })
        .catch(async () => {
            // First-ever rotation — the singleton doc doesn't exist yet.
            await databases.createDocument(db, webhookSecretStateCollection, WEBHOOK_SECRET_STATE_DOC_ID, {
                currentSecret: newSecret,
                previousSecret,
                previousSecretExpiresAt: Date.now() + TWENTY_FOUR_HOURS_MS,
                rotatedAt: new Date().toISOString(),
            });
        });

    return { newSecret, previousSecret };
}
