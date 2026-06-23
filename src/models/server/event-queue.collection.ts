import { Permission, IndexType } from "node-appwrite";
import { db, eventQueueCollection } from "../name";
import { databases } from "./config";

export default async function createEventQueueCollection() {
    await databases.createCollection(db, eventQueueCollection, eventQueueCollection, [
        Permission.read("any"),
    ]);
    console.log("Event Queue collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, eventQueueCollection, "eventType", 50, true),
        databases.createStringAttribute(db, eventQueueCollection, "payload", 100000, true), // JSON
        databases.createStringAttribute(db, eventQueueCollection, "status", 20, true), // "pending", "processing", "complete", "failed"
        databases.createStringAttribute(db, eventQueueCollection, "dedupKey", 64, false),
        databases.createIntegerAttribute(db, eventQueueCollection, "retryCount", false, 0, undefined, 0),
        databases.createDatetimeAttribute(db, eventQueueCollection, "createdAt", true),
        databases.createDatetimeAttribute(db, eventQueueCollection, "processedAt", false),
    ]);
    console.log("Event Queue Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, eventQueueCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, eventQueueCollection, "status_created_sort", IndexType.Key, ["status", "createdAt"]),
        databases.createIndex(db, eventQueueCollection, "dedup_index", IndexType.Key, ["dedupKey"]),
    ]);
    console.log("Event Queue indexes created");
}
