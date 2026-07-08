import { ID } from "node-appwrite";
import { db, commentCollection } from "@/models/name";
import { databases } from "@/models/server/config";

/**
 * Posts a system-authored comment on a PR-linked question — used for
 * lifecycle notices ("merged", "closed", "reopened", "diff refreshed").
 * Mirrors the `authorId: "system"` convention already used for Discussion
 * Rooms system messages (see src/app/api/rooms/*).
 */
export async function postPrSystemComment(questionId: string, content: string): Promise<void> {
    await databases.createDocument(db, commentCollection, ID.unique(), {
        content,
        type: "question",
        typeId: questionId,
        parentId: null,
        authorId: "system",
    });
}
