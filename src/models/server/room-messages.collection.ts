import { Permission } from "node-appwrite";
import { db, roomMessagesCollection } from "../name";
import { databases } from "./config";

export default async function createRoomMessagesCollection() {
    await databases.createCollection(db, roomMessagesCollection, roomMessagesCollection, [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Room Messages collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, roomMessagesCollection, "roomId", 36, true),
        databases.createStringAttribute(db, roomMessagesCollection, "authorId", 36, true),
        databases.createStringAttribute(db, roomMessagesCollection, "authorName", 50, true),
        databases.createStringAttribute(db, roomMessagesCollection, "authorColor", 20, true),
        databases.createStringAttribute(db, roomMessagesCollection, "body", 4000, true),
        databases.createEnumAttribute(db, roomMessagesCollection, "type", ["text", "code", "system"], true),
        databases.createStringAttribute(db, roomMessagesCollection, "language", 30, false),
        databases.createStringAttribute(db, roomMessagesCollection, "reactions", 2000, false),
        databases.createStringAttribute(db, roomMessagesCollection, "replyToId", 36, false),
        databases.createDatetimeAttribute(db, roomMessagesCollection, "editedAt", false),
        databases.createDatetimeAttribute(db, roomMessagesCollection, "deletedAt", false),
    ]);
    console.log("Room Messages Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, roomMessagesCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, roomMessagesCollection, "room_messages", "key", ["roomId", "$createdAt"]),
        databases.createIndex(db, roomMessagesCollection, "room_author_time", "key", ["roomId", "authorId", "$createdAt"]),
    ]);
    console.log("Room Messages indexes created");
}
