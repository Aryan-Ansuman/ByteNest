import { IndexType, Permission } from "node-appwrite";
import { db, reputationEventsCollection, REPUTATION_EVENT_TYPES, REPUTATION_SOURCE_TYPES } from "../name";
import { databases } from "./config";

export default async function createReputationEventsCollection() {
    await databases.createCollection(
        db,
        reputationEventsCollection,
        "Reputation Events",
        [
            Permission.read("users"),
            Permission.create("users"),
            // Append-only: no update or delete permissions.
            // The event log is immutable once written.
        ]
    );
    console.log("Reputation Events collection created");

    const attributes = await Promise.all([
        // Who gained or lost reputation
        databases.createStringAttribute(db, reputationEventsCollection, "userId", 50, true),

        // Positive for gains, negative for losses
        databases.createIntegerAttribute(db, reputationEventsCollection, "delta", true),

        // Why reputation changed
        databases.createEnumAttribute(
            db,
            reputationEventsCollection,
            "eventType",
            [...REPUTATION_EVENT_TYPES],
            true
        ),

        // Running total immediately after this event (Step 1.3)
        databases.createIntegerAttribute(db, reputationEventsCollection, "reputationAfter", true),

        // The document that caused the change (vote ID, answer ID, etc.)
        databases.createStringAttribute(db, reputationEventsCollection, "sourceId", 50, false),

        // Category of the source document
        databases.createEnumAttribute(
            db,
            reputationEventsCollection,
            "sourceType",
            [...REPUTATION_SOURCE_TYPES],
            false
        ),

        // Explicit timestamp (Appwrite $createdAt also works but this is
        // queryable via our index without relying on system fields)
        databases.createDatetimeAttribute(db, reputationEventsCollection, "createdAt", true),

        // True for Phase 3 backfill records; false for all real events
        databases.createBooleanAttribute(db, reputationEventsCollection, "isSynthetic", false, false),
    ]);

    console.log("Reputation Events attributes created");

    // Wait for all attributes to reach "available" status before adding indexes
    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 120; attempt++) {
                const current: any = await databases.getAttribute(
                    db,
                    reputationEventsCollection,
                    attribute.key
                );
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(
                        `reputation_events attribute ${attribute.key} failed to initialize`
                    );
                }
                await new Promise((r) => setTimeout(r, 500));
            }
            throw new Error(
                `Timed out waiting for reputation_events attribute ${attribute.key}`
            );
        })
    );

    // Step 1.4 — Indexes
    await Promise.all([
        // All events for a user, ordered newest-first (sidebar widget)
        databases.createIndex(
            db,
            reputationEventsCollection,
            "userId_index",
            IndexType.Key,
            ["userId"]
        ),
        // Date-range queries for weekly bucket computation
        databases.createIndex(
            db,
            reputationEventsCollection,
            "createdAt_index",
            IndexType.Key,
            ["createdAt"]
        ),
        // Combined index: all events for a user within a date range
        databases.createIndex(
            db,
            reputationEventsCollection,
            "userId_createdAt_index",
            IndexType.Key,
            ["userId", "createdAt"]
        ),
        // Filter out synthetic events efficiently
        databases.createIndex(
            db,
            reputationEventsCollection,
            "userId_synthetic_index",
            IndexType.Key,
            ["userId", "isSynthetic"]
        ),
    ]);

    console.log("Reputation Events indexes created");
}
