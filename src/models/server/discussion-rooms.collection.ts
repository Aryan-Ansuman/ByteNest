import { Permission, IndexType } from "node-appwrite";
import { db, discussionRoomsCollection } from "../name";
import { databases } from "./config";

export default async function createDiscussionRoomsCollection() {
    await databases.createCollection(db, discussionRoomsCollection, discussionRoomsCollection, [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Discussion Rooms collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, discussionRoomsCollection, "hostId", 36, true),
        databases.createStringAttribute(db, discussionRoomsCollection, "name", 100, true),
        databases.createStringAttribute(db, discussionRoomsCollection, "description", 500, false),
        databases.createStringAttribute(db, discussionRoomsCollection, "tags", 50, false, undefined, true),
        databases.createEnumAttribute(db, discussionRoomsCollection, "visibility", ["public", "private"], true),
        databases.createEnumAttribute(db, discussionRoomsCollection, "status", ["active", "archived"], true),
        databases.createIntegerAttribute(db, discussionRoomsCollection, "memberCount", true),
        databases.createIntegerAttribute(db, discussionRoomsCollection, "maxMembers", true),
        databases.createDatetimeAttribute(db, discussionRoomsCollection, "lastActivityAt", true),
        databases.createStringAttribute(db, discussionRoomsCollection, "activeCodeSessionId", 36, false),
        databases.createStringAttribute(db, discussionRoomsCollection, "inviteToken", 64, false),
        databases.createEnumAttribute(db, discussionRoomsCollection, "slowMode", ["off", "5s", "30s", "60s"], true),
        databases.createStringAttribute(db, discussionRoomsCollection, "pinnedMessageId", 36, false),
    ]);
    console.log("Discussion Rooms Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, discussionRoomsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, discussionRoomsCollection, "status_visibility", IndexType.Key, ["status", "visibility"]),
        databases.createIndex(db, discussionRoomsCollection, "last_activity", IndexType.Key, ["lastActivityAt"], ["DESC"]),
        databases.createIndex(db, discussionRoomsCollection, "member_count", IndexType.Key, ["memberCount"], ["DESC"]),
    ]);
    console.log("Discussion Rooms indexes created");
}
