import { Permission, IndexType } from "node-appwrite";
import { db, smellAccuracySnapshotsCollection } from "../name";
import { databases } from "./config";

export default async function createSmellAccuracySnapshotsCollection() {
    await databases.createCollection(db, smellAccuracySnapshotsCollection, smellAccuracySnapshotsCollection, [
        Permission.read("any"),
    ]);
    console.log("Smell Accuracy Snapshots collection is created");

    const attributes = await Promise.all([
        databases.createDatetimeAttribute(db, smellAccuracySnapshotsCollection, "windowStart", true),
        databases.createDatetimeAttribute(db, smellAccuracySnapshotsCollection, "windowEnd", true),
        databases.createIntegerAttribute(db, smellAccuracySnapshotsCollection, "totalFeedbackVotes", true),
        // JSON string — array of { smellId, language, correct, incorrect, total, incorrectRate }.
        databases.createStringAttribute(db, smellAccuracySnapshotsCollection, "perSmellBreakdown", 10000, false),
        databases.createBooleanAttribute(db, smellAccuracySnapshotsCollection, "alertFired", false, false),
        // JSON string — array of human-readable alert reason strings.
        databases.createStringAttribute(db, smellAccuracySnapshotsCollection, "alertReasons", 5000, false),
        databases.createIntegerAttribute(db, smellAccuracySnapshotsCollection, "durationMs", true),
    ]);
    console.log("Smell Accuracy Snapshots Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, smellAccuracySnapshotsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, smellAccuracySnapshotsCollection, "window_end_sort", IndexType.Key, ["windowEnd"]),
    ]);
    console.log("Smell Accuracy Snapshots indexes created");
}
