import { Permission, IndexType } from "node-appwrite";
import { db, similarityCandidatesCollection } from "../name";
import { databases } from "./config";

export default async function createSimilarityCandidatesCollection() {
    await databases.createCollection(db, similarityCandidatesCollection, similarityCandidatesCollection, [
        Permission.read("any"),
    ]);
    console.log("Similarity Candidates collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, similarityCandidatesCollection, "questionId", 50, true),
        databases.createStringAttribute(db, similarityCandidatesCollection, "candidateId", 50, true),
        databases.createFloatAttribute(db, similarityCandidatesCollection, "hybridScore", true),
        databases.createFloatAttribute(db, similarityCandidatesCollection, "semanticScore", true),
        databases.createFloatAttribute(db, similarityCandidatesCollection, "tagOverlapScore", true),
        databases.createFloatAttribute(db, similarityCandidatesCollection, "intentMatchScore", true),
        databases.createFloatAttribute(db, similarityCandidatesCollection, "communityScore", true),
        databases.createStringAttribute(db, similarityCandidatesCollection, "explanationTokens", 5000, false), // JSON array of strings
        databases.createStringAttribute(db, similarityCandidatesCollection, "detectionMethod", 50, true), // "embedding_search", "tag_overlap", "moderator"
        databases.createStringAttribute(db, similarityCandidatesCollection, "status", 20, true), // "suggested", "confirmed", "rejected", "merged"
        databases.createStringAttribute(db, similarityCandidatesCollection, "confirmedBy", 50, false),
        databases.createDatetimeAttribute(db, similarityCandidatesCollection, "createdAt", true),
        databases.createDatetimeAttribute(db, similarityCandidatesCollection, "confirmedAt", false),
    ]);
    console.log("Similarity Candidates Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, similarityCandidatesCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, similarityCandidatesCollection, "question_candidate_unique", "unique", ["questionId", "candidateId"]),
        databases.createIndex(db, similarityCandidatesCollection, "question_score_sort", IndexType.Key, ["questionId", "hybridScore"]),
    ]);
    console.log("Similarity Candidates indexes created");
}
