import { IndexType, Permission } from "node-appwrite";
import { adrQuestionMetadataCollection, db } from "../name";
import { databases } from "./config";

export default async function createAdrQuestionMetadataCollection() {
    await databases.createCollection(db, adrQuestionMetadataCollection, adrQuestionMetadataCollection, [
        Permission.read("any"),
        Permission.read("users"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("AdrQuestionMetadata collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, adrQuestionMetadataCollection, "questionId", 50, true),
        databases.createStringAttribute(db, adrQuestionMetadataCollection, "optionA", 100, true),
        databases.createStringAttribute(db, adrQuestionMetadataCollection, "optionB", 100, true),
        databases.createStringAttribute(db, adrQuestionMetadataCollection, "optionADescription", 500, false),
        databases.createStringAttribute(db, adrQuestionMetadataCollection, "optionBDescription", 500, false),
        // Ordered JSON array of 3-8 selected dimension IDs from ADR_DIMENSIONS
        databases.createStringAttribute(db, adrQuestionMetadataCollection, "adrDimensions", 500, true),
        // "open" | "concluded"
        databases.createStringAttribute(db, adrQuestionMetadataCollection, "adrStatus", 20, false, "open"),
        // Denormalized count, incremented in line with score submissions
        databases.createIntegerAttribute(db, adrQuestionMetadataCollection, "adrSubmissionCount", false, 0, undefined, 0),
    ]);
    console.log("AdrQuestionMetadata Attributes created");

    // Wait for attributes to become available
    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(
                    db,
                    adrQuestionMetadataCollection,
                    attribute.key
                );
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`AdrQuestionMetadata attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for AdrQuestionMetadata attribute ${attribute.key}`);
        })
    );

    // Indexes
    await Promise.all([
        databases.createIndex(db, adrQuestionMetadataCollection, "question_id_unique", IndexType.Unique, ["questionId"]),
        databases.createIndex(db, adrQuestionMetadataCollection, "adr_status_filter", IndexType.Key, ["adrStatus"]),
        databases.createIndex(db, adrQuestionMetadataCollection, "option_a_fulltext", IndexType.Fulltext, ["optionA"]),
        databases.createIndex(db, adrQuestionMetadataCollection, "option_b_fulltext", IndexType.Fulltext, ["optionB"]),
    ]);
    console.log("AdrQuestionMetadata Indexes created");
}
