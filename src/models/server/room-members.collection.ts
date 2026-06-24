import { Permission } from "node-appwrite";
import { db, roomMembersCollection } from "../name";
import { databases } from "./config";

export default async function createRoomMembersCollection() {
    await databases.createCollection(db, roomMembersCollection, roomMembersCollection, [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Room Members collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, roomMembersCollection, "roomId", 36, true),
        databases.createStringAttribute(db, roomMembersCollection, "userId", 36, true),
        databases.createStringAttribute(db, roomMembersCollection, "displayName", 50, true),
        databases.createStringAttribute(db, roomMembersCollection, "avatarColor", 20, true),
        databases.createEnumAttribute(db, roomMembersCollection, "role", ["host", "member"], true),
        databases.createEnumAttribute(db, roomMembersCollection, "status", ["online", "away", "offline", "muted"], true),
        databases.createDatetimeAttribute(db, roomMembersCollection, "joinedAt", true),
        databases.createDatetimeAttribute(db, roomMembersCollection, "lastSeenAt", true),
    ]);
    console.log("Room Members Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, roomMembersCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, roomMembersCollection, "room_user_unique", "unique", ["roomId", "userId"]),
        databases.createIndex(db, roomMembersCollection, "room_status", "key", ["roomId", "status"]),
        databases.createIndex(db, roomMembersCollection, "room_joined", "key", ["roomId", "joinedAt"]),
        databases.createIndex(db, roomMembersCollection, "status_lastseen", "key", ["status", "lastSeenAt"]),
    ]);
    console.log("Room Members indexes created");
}
