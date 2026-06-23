import { Permission, IndexType } from "node-appwrite";
import { db, duplicateFeedbackCollection } from "../name";
import { databases } from "./config";

export default async function createDuplicateFeedbackCollection() {
    await databases.createCollection(db, duplicateFeedbackCollection, duplicateFeedbackCollection, [
        Permission.read("any"),
        Permission.create("any"), // Anyone can submit feedback, even anonymous users in the ask flow
    ]);
    console.log("Duplicate Feedback collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, duplicateFeedbackCollection, "sessionId", 64, true),
        databases.createStringAttribute(db, duplicateFeedbackCollection, "userId", 50, false),
        databases.createStringAttribute(db, duplicateFeedbackCollection, "sourceQuestionTitle", 255, true),
        databases.createStringAttribute(db, duplicateFeedbackCollection, "suggestedCandidateId", 50, false),
        databases.createIntegerAttribute(db, duplicateFeedbackCollection, "rank", false, 1, 3, undefined),
        databases.createStringAttribute(db, duplicateFeedbackCollection, "action", 50, true), // "clicked", "ignored", "posted_anyway", "abandoned", "reported_not_duplicate"
        databases.createIntegerAttribute(db, duplicateFeedbackCollection, "timeToActionMs", false, 0),
        databases.createStringAttribute(db, duplicateFeedbackCollection, "intentLabel", 50, false),
        databases.createFloatAttribute(db, duplicateFeedbackCollection, "semanticScore", false),
        databases.createFloatAttribute(db, duplicateFeedbackCollection, "intentScore", false),
        databases.createFloatAttribute(db, duplicateFeedbackCollection, "tagScore", false),
        databases.createFloatAttribute(db, duplicateFeedbackCollection, "communityScore", false),
        databases.createFloatAttribute(db, duplicateFeedbackCollection, "hybridScore", false),
        databases.createStringAttribute(db, duplicateFeedbackCollection, "explanationTokens", 10000, false),
        databases.createStringAttribute(db, duplicateFeedbackCollection, "scoringExperiment", 100, false),
        databases.createDatetimeAttribute(db, duplicateFeedbackCollection, "createdAt", true),
    ]);
    console.log("Duplicate Feedback Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, duplicateFeedbackCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, duplicateFeedbackCollection, "session_index", IndexType.Key, ["sessionId"]),
        databases.createIndex(db, duplicateFeedbackCollection, "action_sort", IndexType.Key, ["action"]),
    ]);
    console.log("Duplicate Feedback indexes created");
}
