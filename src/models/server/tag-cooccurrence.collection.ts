import { Permission, IndexType } from "node-appwrite";
import { db, tagCooccurrenceCollection } from "../name";
import { databases } from "./config";

export default async function createTagCooccurrenceCollection() {
    await databases.createCollection(db, tagCooccurrenceCollection, tagCooccurrenceCollection, [
        Permission.read("any"),
    ]);
    console.log("Tag Cooccurrence collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, tagCooccurrenceCollection, "tagA", 50, true),
        databases.createStringAttribute(db, tagCooccurrenceCollection, "tagB", 50, true),
        databases.createIntegerAttribute(db, tagCooccurrenceCollection, "strength", true), // Co-occurrence count
    ]);
    console.log("Tag Cooccurrence Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, tagCooccurrenceCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, tagCooccurrenceCollection, "tagA_tagB", "unique", ["tagA", "tagB"]),
        databases.createIndex(db, tagCooccurrenceCollection, "tagA_index", IndexType.Key, ["tagA"]),
        databases.createIndex(db, tagCooccurrenceCollection, "tagB_index", IndexType.Key, ["tagB"]),
        databases.createIndex(db, tagCooccurrenceCollection, "strength_sort", IndexType.Key, ["strength"]),
    ]);
    console.log("Tag Cooccurrence indexes created");
}
