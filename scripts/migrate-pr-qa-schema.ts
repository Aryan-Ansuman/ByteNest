import { IndexType } from "node-appwrite";
import { db, questionCollection, answerCollection } from "../src/models/name";
import { databases } from "../src/models/server/config";
import getOrCreateStorage from "../src/models/server/storageSetup";
import createGithubWebhookRegistrationsCollection from "../src/models/server/github-webhook-registrations.collection";
import createPrQuestionMetadataCollection from "../src/models/server/pr-question-metadata.collection";

async function waitAttribute(collection: string, key: string) {
    for (let attempt = 0; attempt < 60; attempt++) {
        const current: any = await databases.getAttribute(db, collection, key);
        if (current.status === "available") return;
        if (current.status === "failed") {
            throw new Error(`Attribute ${key} in ${collection} failed to initialize`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for attribute ${key} in ${collection}`);
}

async function migrate() {
    console.log("Starting PR-Linked Q&A Phase 1 (Pivot) Migration...");

    // 1. Storage setup
    console.log("Running storage setup (make sure to manually add .diff and .txt to question_attachments allowed extensions in Appwrite Console if it already existed)...");
    await getOrCreateStorage();

    // 2. Question attributes
    // We skipped modifying `questions` because of Appwrite's row size limit.
    // The `questionType` and all metadata are now managed by `pr_question_metadata`.

    // No question indexes to add either.

    // 3. Answer attributes
    console.log("Adding answer attributes...");
    const aAttrs = [
        databases.createStringAttribute(db, answerCollection, "diffLineRef", 500, false),
        databases.createStringAttribute(db, answerCollection, "diffLineContext", 2000, false),
    ];

    for (const promise of aAttrs) {
        try {
            await promise;
        } catch (e: any) {
            console.log("Answer attribute might already exist:", e.message);
        }
    }

    console.log("Waiting for answer attributes to be available...");
    const aKeys = ["diffLineRef", "diffLineContext"];
    for (const key of aKeys) {
        await waitAttribute(answerCollection, key);
    }

    // 4. Create new collections
    console.log("Setting up sidecar metadata collection...");
    try {
        await createPrQuestionMetadataCollection();
    } catch (e: any) {
        console.log("PR Metadata collection might already exist:", e.message);
    }

    console.log("Setting up github webhook registrations collection...");
    try {
        await createGithubWebhookRegistrationsCollection();
    } catch (e: any) {
        console.log("Webhook registrations collection might already exist:", e.message);
    }

    console.log("Migration complete!");
}

migrate().catch(console.error);
