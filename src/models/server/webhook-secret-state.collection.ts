import { db, webhookSecretStateCollection } from "../name";
import { databases } from "./config";

/**
 * PR-Linked Q&A — Phase 7 secret rotation.
 *
 * A single document (fixed $id = WEBHOOK_SECRET_STATE_DOC_ID). Env vars
 * can't be mutated by a running server process, so once rotation needs to
 * happen on a schedule, the "live" secret state has to move into the
 * database — GITHUB_WEBHOOK_SECRET becomes only the bootstrap value used
 * until the first rotation runs. See webhook-secret.ts.
 */
export default async function createWebhookSecretStateCollection() {
    await databases.createCollection(db, webhookSecretStateCollection, webhookSecretStateCollection, []);
    console.log("Webhook Secret State Collection Created");

    await Promise.all([
        databases.createStringAttribute(db, webhookSecretStateCollection, "currentSecret", 200, true),
        databases.createStringAttribute(db, webhookSecretStateCollection, "previousSecret", 200, false),
        // Epoch ms — same convention as rate-limit/processed-webhook-events.
        databases.createIntegerAttribute(db, webhookSecretStateCollection, "previousSecretExpiresAt", false),
        databases.createDatetimeAttribute(db, webhookSecretStateCollection, "rotatedAt", false),
    ]);
    console.log("Webhook Secret State Attributes Created");
}
