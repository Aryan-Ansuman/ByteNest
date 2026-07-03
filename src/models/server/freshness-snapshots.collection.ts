import { Permission, IndexType } from "node-appwrite";
import { db, freshnessSnapshotsCollection } from "../name";
import { databases } from "./config";

export default async function createFreshnessSnapshotsCollection() {
    await databases.createCollection(db, freshnessSnapshotsCollection, freshnessSnapshotsCollection, [
        Permission.read("any"),
    ]);
    console.log("Freshness Snapshots collection is created");

    const attributes = await Promise.all([
        databases.createDatetimeAttribute(db, freshnessSnapshotsCollection, "runAt", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "totalAnswersProcessed", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "freshCount", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "agingCount", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "outdatedCount", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "staleCount", true),
        databases.createFloatAttribute(db, freshnessSnapshotsCollection, "averageFreshnessScore", true),
        // JSON string — array of { techPackage, outdatedOrStaleCount }, top 10.
        databases.createStringAttribute(db, freshnessSnapshotsCollection, "topOutdatedPackages", 5000, false),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "transitionsToOutdated", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "transitionsToStale", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "notificationsQueued", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "packagesRefreshed", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "packageFetchFailures", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "answerWriteErrors", true),
        databases.createIntegerAttribute(db, freshnessSnapshotsCollection, "durationMs", true),
    ]);
    console.log("Freshness Snapshots Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, freshnessSnapshotsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, freshnessSnapshotsCollection, "run_at_sort", IndexType.Key, ["runAt"]),
    ]);
    console.log("Freshness Snapshots indexes created");
}
