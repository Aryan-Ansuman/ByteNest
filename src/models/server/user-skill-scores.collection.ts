import { IndexType, Permission } from "node-appwrite";
import { db, userSkillScoresCollection } from "../name";
import { databases } from "./config";

export default async function createUserSkillScoresCollection() {
    await databases.createCollection(
        db,
        userSkillScoresCollection,
        "User Skill Scores",
        [
            Permission.read("any"),
            Permission.create("users"),
            Permission.update("users"),
            Permission.delete("users"),
        ]
    );
    console.log("User Skill Scores collection created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, userSkillScoresCollection, "userId", 50, true),
        databases.createStringAttribute(db, userSkillScoresCollection, "tag", 50, true),
        databases.createFloatAttribute(db, userSkillScoresCollection, "answerQualityScore", false, 0, 100, 0),
        databases.createFloatAttribute(db, userSkillScoresCollection, "questionQualityScore", false, 0, 100, 0),
        databases.createFloatAttribute(db, userSkillScoresCollection, "temporalConsistencyScore", false, 0, 100, 0),
        databases.createFloatAttribute(db, userSkillScoresCollection, "peerValidationScore", false, 0, 100, 0),
        databases.createFloatAttribute(db, userSkillScoresCollection, "compositeScore", false, 0, 100, 0),
        databases.createEnumAttribute(
            db,
            userSkillScoresCollection,
            "tier",
            ["Newcomer", "Apprentice", "Practitioner", "Expert", "Authority"],
            false,
            "Newcomer"
        ),
        databases.createFloatAttribute(db, userSkillScoresCollection, "scoreSevenDaysAgo", false, 0, 100, 0),
        databases.createEnumAttribute(
            db,
            userSkillScoresCollection,
            "trendDirection",
            ["up", "stable", "down"],
            false,
            "stable"
        ),
        databases.createIntegerAttribute(db, userSkillScoresCollection, "totalAnswers", false, 0, undefined, 0),
        databases.createIntegerAttribute(db, userSkillScoresCollection, "acceptedAnswers", false, 0, undefined, 0),
        databases.createIntegerAttribute(db, userSkillScoresCollection, "totalQuestions", false, 0, undefined, 0),
        databases.createIntegerAttribute(db, userSkillScoresCollection, "totalUpvotesReceived", false, 0, undefined, 0),
        databases.createDatetimeAttribute(db, userSkillScoresCollection, "lastCalculatedAt", false),
        databases.createDatetimeAttribute(db, userSkillScoresCollection, "lastActivityAt", false),
    ]);
    console.log("User Skill Scores attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 120; attempt++) {
                const current: any = await databases.getAttribute(
                    db,
                    userSkillScoresCollection,
                    attribute.key
                );
                if (current.status === "available") return;
                if (current.status === "failed")
                    throw new Error(`Attribute ${attribute.key} failed to initialize`);
                await new Promise((r) => setTimeout(r, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, userSkillScoresCollection, "userId_index", IndexType.Key, ["userId"]),
        databases.createIndex(db, userSkillScoresCollection, "tag_index", IndexType.Key, ["tag"]),
        databases.createIndex(db, userSkillScoresCollection, "userId_tag_unique", IndexType.Unique, ["userId", "tag"]),
        databases.createIndex(db, userSkillScoresCollection, "tag_score_sort", IndexType.Key, ["tag", "compositeScore"]),
        databases.createIndex(db, userSkillScoresCollection, "lastCalculatedAt_index", IndexType.Key, ["lastCalculatedAt"]),
    ]);
    console.log("User Skill Scores indexes created");
}
