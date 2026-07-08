import { Permission, IndexType } from "node-appwrite";
import { processedWebhookEventsCollection, db } from "../name";
import { databases } from "./config";

/**
 * PR-Linked Q&A — Phase 4 idempotency guard.
 *
 * One document per GitHub `X-GitHub-Delivery` ID we've fully processed.
 * The webhook route creates the document with `$id` set to the delivery ID
 * itself, so a duplicate delivery hits Appwrite's own uniqueness constraint
 * (409) instead of a racy read-then-write check.
 *
 * `expiresAt` is a plain epoch-ms number (same convention as
 * rate-limit.collection) — after 7 days a duplicate delivery is effectively
 * impossible, so the webhook route also does a small best-effort cleanup
 * sweep on every call, mirroring `cleanupExpiredRateLimitEvents`.
 */
export default async function createProcessedWebhookEventsCollection() {
    await databases.createCollection(db, processedWebhookEventsCollection, processedWebhookEventsCollection, [
        // No client permissions at all — this collection is written and read
        // exclusively by the webhook route using the server API key.
    ]);
    console.log("Processed Webhook Events Collection Created");

    await Promise.all([
        databases.createStringAttribute(db, processedWebhookEventsCollection, "deliveryId", 100, true),
        databases.createIntegerAttribute(db, processedWebhookEventsCollection, "receivedAt", true),
        databases.createIntegerAttribute(db, processedWebhookEventsCollection, "expiresAt", true),
    ]);
    console.log("Processed Webhook Events Attributes Created");

    await databases.createIndex(
        db,
        processedWebhookEventsCollection,
        "expires_at_cleanup",
        IndexType.Key,
        ["expiresAt"]
    );
    console.log("Processed Webhook Events Indexes Created");
}
