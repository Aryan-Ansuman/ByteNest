import { IndexType, Permission } from "node-appwrite";
import { db, techPackageMapCollection } from "../name";
import { databases } from "./config";

export default async function createTechPackageMapCollection() {
    await databases.createCollection(db, techPackageMapCollection, techPackageMapCollection, [
        Permission.read("any"),
        // Only admins or internal scripts should update this map.
    ]);
    console.log("Tech Package Map collection created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, techPackageMapCollection, "tag", 50, true),
        databases.createEnumAttribute(db, techPackageMapCollection, "ecosystem", ["npm", "pypi", "crates", "github"], true),
        databases.createStringAttribute(db, techPackageMapCollection, "packageName", 100, true),
    ]);
    console.log("Tech Package Map Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, techPackageMapCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`Tech Package Map attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for tech package map attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(
            db,
            techPackageMapCollection,
            "tag_unique",
            IndexType.Unique,
            ["tag"]
        ),
    ]);
    console.log("Tech Package Map indexes created");
}
