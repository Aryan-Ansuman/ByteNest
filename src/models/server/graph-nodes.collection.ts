import { Permission } from "node-appwrite";
import { db, graphNodesCollection } from "../name";
import { databases } from "./config";

export default async function createGraphNodesCollection() {
    await databases.createCollection(db, graphNodesCollection, graphNodesCollection, [
        Permission.read("any"),
    ]);
    console.log("Graph Nodes collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, graphNodesCollection, "nodeType", 50, true), // "question", "tag", "user", "answer", "concept"
        databases.createStringAttribute(db, graphNodesCollection, "nodeId", 100, true), // Specific ID of the entity
        databases.createStringAttribute(db, graphNodesCollection, "attributes", 10000, false), // JSON stringified metadata
        databases.createDatetimeAttribute(db, graphNodesCollection, "createdAt", true),
    ]);
    console.log("Graph Nodes Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, graphNodesCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        // Composite index is not perfectly supported in Appwrite yet so we will query by nodeType and nodeId
        databases.createIndex(db, graphNodesCollection, "type_id", "unique", ["nodeType", "nodeId"]),
    ]);
    console.log("Graph Nodes indexes created");
}
