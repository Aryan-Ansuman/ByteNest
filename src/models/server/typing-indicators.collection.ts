import { Permission } from "node-appwrite";
import { db, typingIndicatorsCollection } from "../name";
import { databases } from "./config";

export default async function createTypingIndicatorsCollection() {
    await databases.createCollection(db, typingIndicatorsCollection, typingIndicatorsCollection, [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Typing Indicators collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, typingIndicatorsCollection, "roomId", 36, true),
        databases.createStringAttribute(db, typingIndicatorsCollection, "userId", 36, true),
        databases.createStringAttribute(db, typingIndicatorsCollection, "displayName", 50, true),
    ]);
    console.log("Typing Indicators Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, typingIndicatorsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, typingIndicatorsCollection, "room_user_typing", "unique", ["roomId", "userId"]),
        databases.createIndex(db, typingIndicatorsCollection, "room_typing", "key", ["roomId"]),
        databases.createIndex(db, typingIndicatorsCollection, "updated_at", "key", ["$updatedAt"]),
    ]);
    console.log("Typing Indicators indexes created");
}
