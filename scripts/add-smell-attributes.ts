// scripts/add-smell-attributes.ts
// Run once with `npx tsx scripts/add-smell-attributes.ts`
//
// Code Smell Auto-Tagger — Phase 1. Adds the six new smell-related
// attributes + four indexes to the existing `questions` collection.
import { IndexType } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, questionCollection } from "@/models/name";

const NEW_ATTRIBUTES: Array<{ key: string; create: () => Promise<unknown> }> = [
    {
        key: "systemTags",
        create: () => databases.createStringAttribute(db, questionCollection, "systemTags", 50, false, undefined, true),
    },
    {
        key: "smellAnalysisStatus",
        create: () =>
            databases.createEnumAttribute(
                db,
                questionCollection,
                "smellAnalysisStatus",
                ["pending", "processing", "complete", "failed", "skipped"],
                false
            ),
    },
    {
        key: "smellAnalysisAt",
        create: () => databases.createDatetimeAttribute(db, questionCollection, "smellAnalysisAt", false),
    },
    {
        key: "smellContentHash",
        create: () => databases.createStringAttribute(db, questionCollection, "smellContentHash", 64, false),
    },
    {
        key: "smellEvidence",
        create: () => databases.createStringAttribute(db, questionCollection, "smellEvidence", 5000, false),
    },
    {
        key: "smellFeedbackSummary",
        create: () => databases.createStringAttribute(db, questionCollection, "smellFeedbackSummary", 2000, false),
    },
];

async function waitForAttribute(key: string, attemptLimit = 60) {
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
        const current: any = await databases.getAttribute(db, questionCollection, key);
        if (current.status === "available") return;
        if (current.status === "failed") throw new Error(`Attribute ${key} failed to initialize`);
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for attribute ${key}`);
}

async function main() {
    console.log("Adding code smell attributes to questions collection...");

    for (const attr of NEW_ATTRIBUTES) {
        try {
            await attr.create();
            console.log(`Created attribute: ${attr.key}, waiting for it to become available...`);
            await waitForAttribute(attr.key);
            console.log(`✅ ${attr.key} ready`);
        } catch (e: any) {
            console.error(`❌ Failed to create ${attr.key}:`, e?.message || e);
        }
    }

    console.log("Creating smell indexes...");
    try {
        await databases.createIndex(db, questionCollection, "smell_status_filter", IndexType.Key, ["smellAnalysisStatus"]);
        await databases.createIndex(db, questionCollection, "system_tags_filter", IndexType.Key, ["systemTags"]);
        await databases.createIndex(db, questionCollection, "smell_analysis_at_sort", IndexType.Key, ["smellAnalysisAt"]);
        await databases.createIndex(
            db,
            questionCollection,
            "smell_status_analysis_at_composite",
            IndexType.Key,
            ["smellAnalysisStatus", "smellAnalysisAt"]
        );
        console.log("✅ Smell indexes created");
    } catch (e: any) {
        console.error("❌ Failed to create smell indexes:", e?.message || e);
    }
}

main();
