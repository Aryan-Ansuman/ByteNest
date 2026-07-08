import { IndexType, Permission } from "node-appwrite";
import { db, prQuestionMetadataCollection } from "../name";
import { databases } from "./config";

// ─── PR-Linked Q&A (Phase 4, Pivot) ────────────────────────────────────
// Stores the PR-specific metadata for a question. We use a sidecar
// collection instead of adding these directly to `questions` to avoid
// hitting Appwrite attribute/row-size limits on the main collection.
// 1-to-1 relationship: `questionId` points to a document in `questions`.
export default async function createPrQuestionMetadataCollection() {
    await databases.createCollection(
        db,
        prQuestionMetadataCollection,
        prQuestionMetadataCollection,
        [
            Permission.read("any"),
            Permission.read("users"),
            Permission.create("users"),
            Permission.update("users"),
            Permission.delete("users"),
        ]
    );
    console.log("PR Question Metadata collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, prQuestionMetadataCollection, "questionId", 50, true),
        databases.createStringAttribute(db, prQuestionMetadataCollection, "prUrl", 500, true),
        databases.createStringAttribute(db, prQuestionMetadataCollection, "prRepoOwner", 100, true),
        databases.createStringAttribute(db, prQuestionMetadataCollection, "prRepoName", 100, true),
        databases.createIntegerAttribute(db, prQuestionMetadataCollection, "prNumber", true, undefined, undefined, undefined),
        databases.createStringAttribute(db, prQuestionMetadataCollection, "prTitle", 500, true),
        databases.createEnumAttribute(db, prQuestionMetadataCollection, "prStatus", ["open", "merged", "closed"], true),
        databases.createStringAttribute(db, prQuestionMetadataCollection, "prBaseRef", 200, true),
        databases.createStringAttribute(db, prQuestionMetadataCollection, "prHeadRef", 200, true),
        databases.createStringAttribute(db, prQuestionMetadataCollection, "prAuthorGithubHandle", 100, true),
        databases.createStringAttribute(db, prQuestionMetadataCollection, "diffFileId", 50, false),
        databases.createDatetimeAttribute(db, prQuestionMetadataCollection, "diffFetchedAt", false),
        databases.createDatetimeAttribute(db, prQuestionMetadataCollection, "prMergedAt", false),
        databases.createDatetimeAttribute(db, prQuestionMetadataCollection, "prClosedAt", false),
    ]);
    console.log("PR Question Metadata Attributes created");

    // Appwrite creates attributes asynchronously. Index creation must wait
    // until every referenced attribute is available.
    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(
                    db,
                    prQuestionMetadataCollection,
                    attribute.key
                );
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`PR Question Metadata attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for PR Question Metadata attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, prQuestionMetadataCollection, "question_id_unique", IndexType.Unique, ["questionId"]),
        databases.createIndex(db, prQuestionMetadataCollection, "pr_url_unique", IndexType.Unique, ["prUrl"]),
        databases.createIndex(
            db,
            prQuestionMetadataCollection,
            "pr_repo_number_composite",
            IndexType.Key,
            ["prRepoOwner", "prRepoName", "prNumber"]
        ),
    ]);
    console.log("PR Question Metadata indexes created");
}
