import { Permission, IndexType } from "node-appwrite";
import { db, codeCommentsCollection } from "../name";
import { databases } from "./config";

export default async function createCodeCommentsCollection() {
    await databases.createCollection(db, codeCommentsCollection, codeCommentsCollection, [
        Permission.read("any"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Code Comments collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, codeCommentsCollection, "sessionId", 36, true),
        databases.createStringAttribute(db, codeCommentsCollection, "roomId", 36, true),
        databases.createStringAttribute(db, codeCommentsCollection, "filename", 200, true),
        // Yjs character offset into the file's Y.Text at time of creation.
        // This is the durable anchor — NOT the line number, which shifts as
        // collaborators type above/below the comment. Line number is
        // recomputed at render time from this offset (see useCodeComments).
        databases.createIntegerAttribute(db, codeCommentsCollection, "anchorOffset", true),
        // Best-effort line number captured at creation time, used only as a
        // fallback before the live recalculation runs (e.g. first paint).
        databases.createIntegerAttribute(db, codeCommentsCollection, "lineNumberAtCreate", true),
        databases.createStringAttribute(db, codeCommentsCollection, "authorId", 36, true),
        databases.createStringAttribute(db, codeCommentsCollection, "authorName", 50, true),
        databases.createStringAttribute(db, codeCommentsCollection, "authorColor", 20, true),
        databases.createStringAttribute(db, codeCommentsCollection, "body", 2000, true),
        databases.createDatetimeAttribute(db, codeCommentsCollection, "resolvedAt", false),
        databases.createStringAttribute(db, codeCommentsCollection, "resolvedBy", 36, false),
        // Thread support: top-level comments have parentId = null; replies
        // reference the root comment's $id.
        databases.createStringAttribute(db, codeCommentsCollection, "parentId", 36, false),
    ]);
    console.log("Code Comments Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, codeCommentsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, codeCommentsCollection, "session_file", IndexType.Key, ["sessionId", "filename"]),
        databases.createIndex(db, codeCommentsCollection, "session_id", IndexType.Key, ["sessionId"]),
        databases.createIndex(db, codeCommentsCollection, "parent_id", IndexType.Key, ["parentId"]),
        databases.createIndex(db, codeCommentsCollection, "created_at", IndexType.Key, ["$createdAt"]),
    ]);
    console.log("Code Comments indexes created");
}
