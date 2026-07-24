import { IndexType, Permission } from "node-appwrite";
import { adrScoreSubmissionsCollection, db } from "../name";
import { databases } from "./config";

export default async function createAdrScoreSubmissionsCollection() {
    await databases.createCollection(db, adrScoreSubmissionsCollection, adrScoreSubmissionsCollection, [
        Permission.read("any"),
        Permission.read("users"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("AdrScoreSubmissions collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, adrScoreSubmissionsCollection, "questionId", 50, true),
        databases.createStringAttribute(db, adrScoreSubmissionsCollection, "userId", 50, true),
        // JSON strings containing the scores e.g. '{"performance": 4, "scalability": 5}'
        databases.createStringAttribute(db, adrScoreSubmissionsCollection, "optionAScores", 1000, true),
        databases.createStringAttribute(db, adrScoreSubmissionsCollection, "optionBScores", 1000, true),
        databases.createStringAttribute(db, adrScoreSubmissionsCollection, "reasoning", 1000, false),
        // "novice" | "intermediate" | "expert"
        databases.createStringAttribute(db, adrScoreSubmissionsCollection, "expertise", 20, true),
        databases.createDatetimeAttribute(db, adrScoreSubmissionsCollection, "submittedAt", true),
        databases.createDatetimeAttribute(db, adrScoreSubmissionsCollection, "updatedAt", false),
    ]);
    console.log("AdrScoreSubmissions Attributes created");

    // Wait for attributes to become available
    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(
                    db,
                    adrScoreSubmissionsCollection,
                    attribute.key
                );
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`AdrScoreSubmissions attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for AdrScoreSubmissions attribute ${attribute.key}`);
        })
    );

    // Indexes
    await Promise.all([
        // One submission per user per question
        databases.createIndex(db, adrScoreSubmissionsCollection, "question_user_unique", IndexType.Unique, ["questionId", "userId"]),
        databases.createIndex(db, adrScoreSubmissionsCollection, "question_id_filter", IndexType.Key, ["questionId"]),
        databases.createIndex(db, adrScoreSubmissionsCollection, "user_id_filter", IndexType.Key, ["userId"]),
    ]);
    console.log("AdrScoreSubmissions Indexes created");
}
