import { IndexType } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, answerCollection } from "@/models/name";

async function waitForAttribute(key: string, attemptLimit = 60) {
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
        const current: any = await databases.getAttribute(db, answerCollection, key);
        if (current.status === "available") return;
        if (current.status === "failed") {
            throw new Error(`Attribute ${key} failed to initialize`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for attribute ${key}`);
}

async function main() {
    console.log("Adding branching attributes to answers collection...");

    try {
        // 1. Create Attributes
        console.log("Creating attributes...");
        const attributes = [
            databases.createStringAttribute(db, answerCollection, "parentAnswerId", 50, false),
            databases.createStringAttribute(db, answerCollection, "condition", 200, false),
            databases.createIntegerAttribute(db, answerCollection, "branchDepth", false, 0, 3, 0),
            databases.createStringAttribute(db, answerCollection, "branchLabel", 100, false),
        ];

        await Promise.all(attributes.map((p) => p.catch((e: any) => {
            if (e.message?.includes("already exists")) {
                console.log("Attribute already exists, skipping...");
            } else {
                throw e;
            }
        })));

        console.log("Waiting for attributes to become available...");
        await Promise.all([
            waitForAttribute("parentAnswerId"),
            waitForAttribute("condition"),
            waitForAttribute("branchDepth"),
            waitForAttribute("branchLabel"),
        ]);

        // 2. Create Indexes
        console.log("Creating indexes...");
        const indexDefinitions = [
            { id: "parent_answer_lookup", type: IndexType.Key, attrs: ["parentAnswerId"] },
            { id: "branch_depth_filter", type: IndexType.Key, attrs: ["branchDepth"] },
        ];

        for (const idx of indexDefinitions) {
            try {
                await databases.createIndex(db, answerCollection, idx.id, idx.type, idx.attrs);
                console.log(`Created index ${idx.id}`);
            } catch (e: any) {
                if (e.message?.includes("already exists")) {
                    console.log(`Index ${idx.id} already exists, skipping...`);
                } else {
                    console.error(`Failed to create index ${idx.id}:`, e?.message);
                    throw e;
                }
            }
        }

        console.log("✅ Branching attributes and indexes ready.");
    } catch (e: any) {
        console.error("❌ Migration failed:", e?.message || e);
    }
}

main();
