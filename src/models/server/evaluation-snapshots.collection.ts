import { Permission, IndexType } from "node-appwrite";
import { db, evaluationSnapshotsCollection } from "../name";
import { databases } from "./config";

export default async function createEvaluationSnapshotsCollection() {
    await databases.createCollection(db, evaluationSnapshotsCollection, evaluationSnapshotsCollection, [
        Permission.read("any"),
    ]);
    console.log("Evaluation Snapshots collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, evaluationSnapshotsCollection, "weekStartDate", 20, true),
        databases.createStringAttribute(db, evaluationSnapshotsCollection, "weekEndDate", 20, true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "duplicatePreventionRate", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "precisionAt3", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "falsePositiveRate", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "suggestionCTR", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "postingAbandonmentRate", true),
        databases.createIntegerAttribute(db, evaluationSnapshotsCollection, "totalSessionsWithSuggestions", true),
        databases.createIntegerAttribute(db, evaluationSnapshotsCollection, "sessionsWithNoPost", true),
        databases.createIntegerAttribute(db, evaluationSnapshotsCollection, "totalSuggestionsShown", true),
        databases.createIntegerAttribute(db, evaluationSnapshotsCollection, "confirmedDuplicates", true),
        databases.createIntegerAttribute(db, evaluationSnapshotsCollection, "explicitRejections", true),
        databases.createIntegerAttribute(db, evaluationSnapshotsCollection, "sessionsWithClick", true),
        databases.createIntegerAttribute(db, evaluationSnapshotsCollection, "sessionsClickedThenAbandoned", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingAvgDuplicatePreventionRate", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingAvgPrecisionAt3", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingAvgFalsePositiveRate", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingAvgSuggestionCTR", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingAvgPostingAbandonmentRate", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingStdDuplicatePreventionRate", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingStdPrecisionAt3", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingStdFalsePositiveRate", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingStdSuggestionCTR", true),
        databases.createFloatAttribute(db, evaluationSnapshotsCollection, "trailingStdPostingAbandonmentRate", true),
        databases.createBooleanAttribute(db, evaluationSnapshotsCollection, "alertFired", true),
        databases.createStringAttribute(db, evaluationSnapshotsCollection, "alertReasons", 10000, true),
        databases.createStringAttribute(db, evaluationSnapshotsCollection, "experimentBreakdowns", 10000, false),
        databases.createDatetimeAttribute(db, evaluationSnapshotsCollection, "createdAt", false),
    ]);
    console.log("Evaluation Snapshots Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, evaluationSnapshotsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, evaluationSnapshotsCollection, "week_unique", "unique", ["weekStartDate"]),
    ]);
    console.log("Evaluation Snapshots indexes created");
}
