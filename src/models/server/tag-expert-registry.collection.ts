import { IndexType, Permission } from "node-appwrite";
import { db, tagExpertRegistryCollection } from "../name";
import { databases } from "./config";

export default async function createTagExpertRegistryCollection() {
    await databases.createCollection(
        db,
        tagExpertRegistryCollection,
        "Tag Expert Registry",
        [
            Permission.read("any"),
            Permission.create("users"),
            Permission.update("users"),
            Permission.delete("users"),
        ]
    );
    console.log("Tag Expert Registry collection created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, tagExpertRegistryCollection, "tag", 50, true),
        databases.createStringAttribute(db, tagExpertRegistryCollection, "userId", 50, true),
        databases.createStringAttribute(db, tagExpertRegistryCollection, "userName", 100, false),
        databases.createFloatAttribute(db, tagExpertRegistryCollection, "compositeScore", false, 0, 100, 0),
        databases.createEnumAttribute(
            db,
            tagExpertRegistryCollection,
            "tier",
            ["Newcomer", "Apprentice", "Practitioner", "Expert", "Authority"],
            false,
            "Newcomer"
        ),
        databases.createIntegerAttribute(db, tagExpertRegistryCollection, "rank", false, 1, undefined, 1),
        databases.createDatetimeAttribute(db, tagExpertRegistryCollection, "builtAt", false),
    ]);
    console.log("Tag Expert Registry attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 120; attempt++) {
                const current: any = await databases.getAttribute(
                    db,
                    tagExpertRegistryCollection,
                    attribute.key
                );
                if (current.status === "available") return;
                if (current.status === "failed")
                    throw new Error(`Attribute ${attribute.key} failed to initialize`);
                await new Promise((r) => setTimeout(r, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, tagExpertRegistryCollection, "tag_index", IndexType.Key, ["tag"]),
        databases.createIndex(db, tagExpertRegistryCollection, "userId_index", IndexType.Key, ["userId"]),
        databases.createIndex(db, tagExpertRegistryCollection, "tag_unique", IndexType.Unique, ["tag", "userId"]),
        databases.createIndex(db, tagExpertRegistryCollection, "tag_score_sort", IndexType.Key, ["tag", "compositeScore"]),
        databases.createIndex(db, tagExpertRegistryCollection, "tag_rank_sort", IndexType.Key, ["tag", "rank"]),
    ]);
    console.log("Tag Expert Registry indexes created");
}
