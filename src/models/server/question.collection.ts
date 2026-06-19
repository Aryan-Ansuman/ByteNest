import { Permission } from "node-appwrite";
import { db, questionCollection } from "../name";
import { databases } from "./config";

export default async function createQuestionCollection() {
    await databases.createCollection(db, questionCollection, questionCollection, [
        Permission.read("any"),
        Permission.read("users"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Question collection is created");

    await Promise.all([
        databases.createStringAttribute(db, questionCollection, "title", 100, true),
        databases.createStringAttribute(db, questionCollection, "content", 10000, true),
        databases.createStringAttribute(db, questionCollection, "authorId", 50, true),
        databases.createStringAttribute(db, questionCollection, "tags", 50, true, undefined, true),
        databases.createStringAttribute(db, questionCollection, "attachmentId", 50, false),
        databases.createStringAttribute(db, questionCollection, "acceptedAnswerId", 50, false),
        databases.createIntegerAttribute(db, questionCollection, "views", false, 0, undefined, 0),
        // Denormalized vote counter — incremented/decremented by the vote API.
        // Eliminates the need to list all vote documents just to get a count,
        // and removes the VOTE_LIMIT ceiling problem entirely.
        databases.createIntegerAttribute(db, questionCollection, "totalVotes", false, undefined, undefined, 0),
    ]);
    console.log("Question Attributes created");
}
