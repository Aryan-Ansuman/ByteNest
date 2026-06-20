import { IndexType, Permission } from "node-appwrite";
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

    const attributes = await Promise.all([
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
        // Kept in sync by the answer API so unanswered filtering is correct
        // before pagination is applied.
        databases.createIntegerAttribute(db, questionCollection, "totalAnswers", false, 0, undefined, 0),
        // Latest question edit or answer mutation, used by the Active sort.
        databases.createDatetimeAttribute(db, questionCollection, "activityAt", false),
    ]);
    console.log("Question Attributes created");

    // Appwrite creates attributes asynchronously. Index creation must wait
    // until every referenced attribute is available.
    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(
                    db,
                    questionCollection,
                    attribute.key
                );
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`Question attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for question attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, questionCollection, "title_fulltext", IndexType.Fulltext, ["title"]),
        databases.createIndex(db, questionCollection, "content_fulltext", IndexType.Fulltext, ["content"]),
        databases.createIndex(db, questionCollection, "votes_sort", IndexType.Key, ["totalVotes"]),
        databases.createIndex(db, questionCollection, "answers_filter", IndexType.Key, ["totalAnswers"]),
        databases.createIndex(db, questionCollection, "activity_sort", IndexType.Key, ["activityAt"]),
    ]);
    console.log("Question indexes created");
}
