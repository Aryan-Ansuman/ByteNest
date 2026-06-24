import { Permission } from "node-appwrite";
import { db, codeSessionsCollection } from "../name";
import { databases } from "./config";

export default async function createCodeSessionsCollection() {
    await databases.createCollection(db, codeSessionsCollection, codeSessionsCollection, [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Code Sessions collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, codeSessionsCollection, "roomId", 36, true),
        databases.createStringAttribute(db, codeSessionsCollection, "hostId", 36, true),
        databases.createEnumAttribute(db, codeSessionsCollection, "status", ["active", "ended"], true),
        databases.createStringAttribute(db, codeSessionsCollection, "files", 5000, true),
        databases.createStringAttribute(db, codeSessionsCollection, "activeFile", 100, true),
        databases.createStringAttribute(db, codeSessionsCollection, "yjsSnapshotB64", 1000000, false),
        databases.createBooleanAttribute(db, codeSessionsCollection, "viewOnly", true),
        databases.createDatetimeAttribute(db, codeSessionsCollection, "endedAt", false),
    ]);
    console.log("Code Sessions Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, codeSessionsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, codeSessionsCollection, "room_session_status", "key", ["roomId", "status"]),
    ]);
    console.log("Code Sessions indexes created");
}
