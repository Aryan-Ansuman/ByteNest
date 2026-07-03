import { IndexType, Permission } from "node-appwrite";
import { db, testRunsCollection } from "../name";
import { databases } from "./config";

// Audit trail for every TVA execution attempt — never overwritten. One
// document per Piston call, so an answer's verification panel can show
// "verified 3 times, last failed on June 2 after a retroactive test update."
export default async function createTestRunsCollection() {
    await databases.createCollection(db, testRunsCollection, testRunsCollection, [
        Permission.read("any"),
        Permission.read("users"),
    ]);
    console.log("Test Runs collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, testRunsCollection, "answerId", 50, true),
        databases.createStringAttribute(db, testRunsCollection, "questionId", 50, true),
        // userId, or "system" for retroactive/scheduled drift-check runs.
        databases.createStringAttribute(db, testRunsCollection, "triggeredBy", 50, true),
        // pending | processing | complete | failed — same vocabulary as event_queue.
        databases.createStringAttribute(db, testRunsCollection, "status", 20, true),
        databases.createStringAttribute(db, testRunsCollection, "stdout", 20000, false),
        databases.createStringAttribute(db, testRunsCollection, "stderr", 20000, false),
        databases.createIntegerAttribute(db, testRunsCollection, "exitCode", false, undefined, undefined, undefined),
        databases.createIntegerAttribute(db, testRunsCollection, "durationMs", false, undefined, undefined, undefined),
        // Language + version string returned by Piston, e.g. "python:3.10.0".
        databases.createStringAttribute(db, testRunsCollection, "pistonRuntime", 50, false),
        databases.createDatetimeAttribute(db, testRunsCollection, "createdAt", true),
        databases.createDatetimeAttribute(db, testRunsCollection, "completedAt", false),
    ]);
    console.log("Test Runs Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, testRunsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`Test run attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for test run attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, testRunsCollection, "answer_filter", IndexType.Key, ["answerId"]),
        databases.createIndex(db, testRunsCollection, "question_filter", IndexType.Key, ["questionId"]),
        databases.createIndex(db, testRunsCollection, "status_created_sort", IndexType.Key, ["status", "createdAt"]),
    ]);
    console.log("Test Runs indexes created");
}
