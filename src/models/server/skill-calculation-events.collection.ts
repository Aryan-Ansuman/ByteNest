import { IndexType, Permission } from "node-appwrite";
import { db, skillCalcEventsCollection } from "../name";
import { databases } from "./config";

export default async function createSkillCalculationEventsCollection() {
    await databases.createCollection(
        db,
        skillCalcEventsCollection,
        "Skill Calculation Events",
        [
            Permission.read("users"),
            Permission.create("users"),
            Permission.update("users"),
            Permission.delete("users"),
        ]
    );
    console.log("Skill Calculation Events collection created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, skillCalcEventsCollection, "userId", 50, true),
        databases.createStringAttribute(db, skillCalcEventsCollection, "tag", 50, true),
        databases.createEnumAttribute(
            db,
            skillCalcEventsCollection,
            "triggerType",
            ["vote_cast", "answer_posted", "answer_accepted", "question_posted", "decay_run", "backfill"],
            true
        ),
        databases.createEnumAttribute(
            db,
            skillCalcEventsCollection,
            "priority",
            ["low", "normal", "high"],
            false,
            "normal"
        ),
        databases.createEnumAttribute(
            db,
            skillCalcEventsCollection,
            "status",
            ["pending", "processing", "completed", "failed"],
            false,
            "pending"
        ),
        databases.createFloatAttribute(db, skillCalcEventsCollection, "previousScore", false, 0, 100, 0),
        databases.createFloatAttribute(db, skillCalcEventsCollection, "newScore", false, 0, 100, 0),
        databases.createStringAttribute(db, skillCalcEventsCollection, "sourceDocumentId", 50, false),
        databases.createDatetimeAttribute(db, skillCalcEventsCollection, "scheduledAt", false),
        databases.createDatetimeAttribute(db, skillCalcEventsCollection, "completedAt", false),
        databases.createStringAttribute(db, skillCalcEventsCollection, "errorMessage", 500, false),
    ]);
    console.log("Skill Calculation Events attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 120; attempt++) {
                const current: any = await databases.getAttribute(
                    db,
                    skillCalcEventsCollection,
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
        databases.createIndex(db, skillCalcEventsCollection, "userId_index", IndexType.Key, ["userId"]),
        databases.createIndex(db, skillCalcEventsCollection, "tag_index", IndexType.Key, ["tag"]),
        databases.createIndex(db, skillCalcEventsCollection, "userId_tag_index", IndexType.Key, ["userId", "tag"]),
        databases.createIndex(db, skillCalcEventsCollection, "status_index", IndexType.Key, ["status"]),
        databases.createIndex(db, skillCalcEventsCollection, "scheduledAt_index", IndexType.Key, ["scheduledAt"]),
        databases.createIndex(db, skillCalcEventsCollection, "userId_tag_status_index", IndexType.Key, ["userId", "tag", "status"]),
    ]);
    console.log("Skill Calculation Events indexes created");
}
