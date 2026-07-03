import { IndexType, Permission } from "node-appwrite";
import { db, notificationsCollection, NOTIFICATION_TYPES } from "../name";
import { databases } from "./config";

// Temporal Answer Decay — Phase 7.
//
// Deliberately separate from `reputation_events`: reputation events are
// computational inputs to a score, replayed and aggregated. These are
// pull-based — a human opens the bell icon, reads them, and marks them
// read. Different access pattern, different collection.
//
// Populated by nightly-job.ts Step 3 (one row per author per
// threshold-crossing answer, subject to the same throttle as
// freshness_notifications). `type` starts with just "answer_outdated" but
// is a generic enum so future features (e.g. "new_answer",
// "comment_reply") can reuse this collection instead of building their own.
export default async function createNotificationsCollection() {
    await databases.createCollection(db, notificationsCollection, notificationsCollection, [
        Permission.create("users"),
        Permission.read("users"),
        Permission.update("users"),
    ]);
    console.log("Notifications collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, notificationsCollection, "userId", 50, true),
        databases.createEnumAttribute(db, notificationsCollection, "type", [...NOTIFICATION_TYPES], true),
        // JSON-serialized payload — shape varies by `type`. For
        // "answer_outdated": { answerId, questionId, questionTitle,
        // answerSnippet, techPackage, versionMax, latestVersion, reportedCount }.
        databases.createStringAttribute(db, notificationsCollection, "payload", 5000, true),
        databases.createDatetimeAttribute(db, notificationsCollection, "readAt", false),
        databases.createDatetimeAttribute(db, notificationsCollection, "createdAt", true),
    ]);
    console.log("Notifications Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, notificationsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed to initialize`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        // Bell icon's unread-count + list query: userId == me AND readAt IS NULL, sorted by createdAt.
        databases.createIndex(db, notificationsCollection, "user_unread_filter", IndexType.Key, [
            "userId",
            "readAt",
            "createdAt",
        ]),
    ]);
    console.log("Notifications indexes created");
}
