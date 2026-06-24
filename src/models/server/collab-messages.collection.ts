import { Permission } from "node-appwrite";
import { db, collabMessagesCollection } from "../name";
import { databases } from "./config";

export default async function createCollabMessagesCollection() {
    await databases.createCollection(db, collabMessagesCollection, collabMessagesCollection, [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Collab Messages collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, collabMessagesCollection, "sessionId", 36, true),
        databases.createStringAttribute(db, collabMessagesCollection, "roomId", 36, true),
        databases.createStringAttribute(db, collabMessagesCollection, "senderId", 36, true),
        databases.createStringAttribute(db, collabMessagesCollection, "update", 100000, true),
        databases.createIntegerAttribute(db, collabMessagesCollection, "type", true),
    ]);
    console.log("Collab Messages Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, collabMessagesCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, collabMessagesCollection, "session_id", "key", ["sessionId"]),
        databases.createIndex(db, collabMessagesCollection, "created_at", "key", ["$createdAt"]),
    ]);
    console.log("Collab Messages indexes created");
}
