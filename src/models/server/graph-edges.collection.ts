import { Permission, IndexType } from "node-appwrite";
import { db, graphEdgesCollection } from "../name";
import { databases } from "./config";

export default async function createGraphEdgesCollection() {
    await databases.createCollection(db, graphEdgesCollection, graphEdgesCollection, [
        Permission.read("any"),
    ]);
    console.log("Graph Edges collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, graphEdgesCollection, "sourceId", 100, true), // "nodeType:nodeId" format
        databases.createStringAttribute(db, graphEdgesCollection, "targetId", 100, true), // "nodeType:nodeId" format
        databases.createStringAttribute(db, graphEdgesCollection, "edgeType", 50, true), // "question_to_question", "question_to_tag", etc
        databases.createFloatAttribute(db, graphEdgesCollection, "weight", false, undefined, undefined, 1.0),
        databases.createStringAttribute(db, graphEdgesCollection, "attributes", 10000, false), // JSON stringified edge metadata
        databases.createDatetimeAttribute(db, graphEdgesCollection, "createdAt", true),
    ]);
    console.log("Graph Edges Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, graphEdgesCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, graphEdgesCollection, "source_target", "unique", ["sourceId", "targetId", "edgeType"]),
        databases.createIndex(db, graphEdgesCollection, "source_index", IndexType.Key, ["sourceId"]),
        databases.createIndex(db, graphEdgesCollection, "target_index", IndexType.Key, ["targetId"]),
    ]);
    console.log("Graph Edges indexes created");
}
