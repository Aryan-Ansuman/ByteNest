import { Permission, IndexType } from "node-appwrite";
import { db, questionEmbeddingsCollection } from "../name";
import { databases } from "./config";

export default async function createQuestionEmbeddingsCollection() {
    await databases.createCollection(db, questionEmbeddingsCollection, questionEmbeddingsCollection, [
        Permission.read("any"),
    ]);
    console.log("Question Embeddings collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, questionEmbeddingsCollection, "questionId", 50, true),
        databases.createStringAttribute(db, questionEmbeddingsCollection, "embeddingVector", 100000, false), // JSON array of floats. For 1536 dims, around ~30KB as JSON
        databases.createStringAttribute(db, questionEmbeddingsCollection, "embeddingInput", 10000, false), // Exact text embedded
        databases.createStringAttribute(db, questionEmbeddingsCollection, "embeddingModel", 50, false),
        databases.createIntegerAttribute(db, questionEmbeddingsCollection, "embeddingVersion", false, 0),
        databases.createStringAttribute(db, questionEmbeddingsCollection, "embeddingStatus", 20, true), // "pending", "generating", "complete", "failed", "stale"
        databases.createDatetimeAttribute(db, questionEmbeddingsCollection, "lastEmbeddedAt", false),
        databases.createStringAttribute(db, questionEmbeddingsCollection, "contentHash", 64, false), // SHA-256 hash
        databases.createIntegerAttribute(db, questionEmbeddingsCollection, "dimensions", false, 0),
        databases.createIntegerAttribute(db, questionEmbeddingsCollection, "retryCount", false, 0, undefined, 0),
        databases.createDatetimeAttribute(db, questionEmbeddingsCollection, "nextRetryAt", false),
        databases.createStringAttribute(db, questionEmbeddingsCollection, "failureReason", 1000, false),
    ]);
    console.log("Question Embeddings Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, questionEmbeddingsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, questionEmbeddingsCollection, "questionId_unique", "unique", ["questionId"]),
        databases.createIndex(db, questionEmbeddingsCollection, "status_sort", IndexType.Key, ["embeddingStatus"]),
    ]);
    console.log("Question Embeddings indexes created");
}
