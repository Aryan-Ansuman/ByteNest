import { Permission, IndexType } from "node-appwrite";
import { db, rateLimitCollection } from "../name";
import { databases } from "./config";

export default async function createRateLimitCollection() {
    await databases.createCollection(db, rateLimitCollection, rateLimitCollection, [
        Permission.read("users"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Rate limit collection created");

    await Promise.all([
        databases.createStringAttribute(db, rateLimitCollection, IndexType.Key, 255, true),
        databases.createStringAttribute(db, rateLimitCollection, "bucket", 64, true),
        databases.createIntegerAttribute(db, rateLimitCollection, "createdAt", true),
        databases.createIntegerAttribute(db, rateLimitCollection, "expiresAt", true),
    ]);
    console.log("Rate limit attributes created");
}
