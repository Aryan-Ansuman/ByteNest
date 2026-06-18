import { Permission } from "node-appwrite";
import { answerCollection, db } from "../name";
import { databases } from "./config";

export default async function createAnswerCollection() {
    await databases.createCollection(db, answerCollection, answerCollection, [
        Permission.create("users"),
        Permission.read("any"),
        Permission.read("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Answer Collection Created");

    await Promise.all([
        databases.createStringAttribute(db, answerCollection, "content", 10000, true),
        databases.createStringAttribute(db, answerCollection, "questionId", 50, true),
        databases.createStringAttribute(db, answerCollection, "authorId", 50, true),
        // Denormalized vote counter — incremented/decremented by the vote API.
        databases.createIntegerAttribute(db, answerCollection, "totalVotes", false, undefined, undefined, 0),
        // True only when the question author explicitly marks this answer as accepted.
        // Defaults false; only one answer per question should ever be true at a time
        // (enforced by the PATCH /api/answer endpoint).
        databases.createBooleanAttribute(db, answerCollection, "isAccepted", false, false),
    ]);
    console.log("Answer Attributes Created");
}
