// scripts/add-has-verified-answer-attribute.ts
// Run once with `npx tsx scripts/add-has-verified-answer-attribute.ts`
//
// TVA — Phase 7. Adds the denormalized hasVerifiedAnswer flag to the
// existing `questions` collection (created before this attribute existed,
// so question.collection.ts's own createCollection path never runs again
// to pick it up) and the matching filter index used by the similarity
// pipeline's Stage-1 batch fetch.
import { IndexType } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, questionCollection } from "@/models/name";

async function waitForAttribute(key: string, attemptLimit = 60) {
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
        const current: any = await databases.getAttribute(db, questionCollection, key);
        if (current.status === "available") return;
        if (current.status === "failed") {
            throw new Error(`Attribute ${key} failed to initialize`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for attribute ${key}`);
}

async function main() {
    console.log("Adding hasVerifiedAnswer attribute to questions collection...");

    try {
        await databases.createBooleanAttribute(db, questionCollection, "hasVerifiedAnswer", false, false);
        console.log("hasVerifiedAnswer attribute created, waiting for it to become available...");
        await waitForAttribute("hasVerifiedAnswer");

        console.log("Creating has_verified_answer_filter index...");
        await databases.createIndex(
            db,
            questionCollection,
            "has_verified_answer_filter",
            IndexType.Key,
            ["hasVerifiedAnswer"]
        );

        console.log("✅ hasVerifiedAnswer attribute + index ready.");
    } catch (e: any) {
        console.error("❌ Failed to add hasVerifiedAnswer:", e?.message || e);
    }
}

main();
