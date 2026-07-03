import { IndexType, Permission } from "node-appwrite";
import { db, freshnessNotificationsCollection } from "../name";
import { databases } from "./config";

// Written by Step 3 of the nightly job when an answer crosses into
// outdated/stale. This is a queue in the loose sense — Phase 7 consumes it
// to build the actual user-facing notification. Kept separate from
// event_queue because these records are read/marked-read by a human via
// the notification bell, not retried/dispatched by a worker.
export default async function createFreshnessNotificationsCollection() {
    await databases.createCollection(db, freshnessNotificationsCollection, freshnessNotificationsCollection, [
        Permission.create("users"),
        Permission.read("users"),
        Permission.update("users"),
    ]);
    console.log("Freshness Notifications collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, freshnessNotificationsCollection, "answerId", 50, true),
        databases.createStringAttribute(db, freshnessNotificationsCollection, "authorId", 50, true),
        databases.createStringAttribute(db, freshnessNotificationsCollection, "techPackage", 100, false),
        databases.createEnumAttribute(db, freshnessNotificationsCollection, "freshnessLabel", ["outdated", "stale"], true),
        databases.createDatetimeAttribute(db, freshnessNotificationsCollection, "createdAt", true),
        databases.createDatetimeAttribute(db, freshnessNotificationsCollection, "processedAt", false),
    ]);
    console.log("Freshness Notifications Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, freshnessNotificationsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed to initialize`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, freshnessNotificationsCollection, "author_filter", IndexType.Key, ["authorId"]),
        databases.createIndex(db, freshnessNotificationsCollection, "unprocessed_filter", IndexType.Key, ["processedAt"]),
    ]);
    console.log("Freshness Notifications indexes created");
}
