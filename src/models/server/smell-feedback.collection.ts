import { IndexType, Permission } from "node-appwrite";
import { db, smellFeedbackCollection } from "../name";
import { databases } from "./config";

// One document per (questionId, smellId, userId) — "was this system-detected
// smell tag correct?" Distinct from staleness votes / regular votes; feeds
// only smellFeedbackSummary and the auto-removal threshold, never touches
// author reputation.
export default async function createSmellFeedbackCollection() {
    await databases.createCollection(db, smellFeedbackCollection, smellFeedbackCollection, [
        Permission.create("users"),
        Permission.read("any"),
        Permission.read("users"),
    ]);
    console.log("Smell Feedback collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, smellFeedbackCollection, "questionId", 50, true),
        databases.createStringAttribute(db, smellFeedbackCollection, "smellId", 50, true),
        databases.createStringAttribute(db, smellFeedbackCollection, "userId", 50, true),
        databases.createEnumAttribute(db, smellFeedbackCollection, "verdict", ["correct", "incorrect"], true),
        databases.createDatetimeAttribute(db, smellFeedbackCollection, "createdAt", true),
    ]);
    console.log("Smell Feedback Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, smellFeedbackCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed to initialize`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, smellFeedbackCollection, "question_smell_filter", IndexType.Key, ["questionId", "smellId"]),
        databases.createIndex(db, smellFeedbackCollection, "created_at_sort", IndexType.Key, ["createdAt"]),
        // Enforces one vote per user per smell per question.
        databases.createIndex(
            db,
            smellFeedbackCollection,
            "question_smell_user_unique",
            IndexType.Unique,
            ["questionId", "smellId", "userId"]
        ),
    ]);
    console.log("Smell Feedback indexes created");
}
