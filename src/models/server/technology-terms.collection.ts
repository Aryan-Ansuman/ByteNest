import { Permission, IndexType } from "node-appwrite";
import { db, technologyTermsCollection } from "../name";
import { databases } from "./config";

export default async function createTechnologyTermsCollection() {
    await databases.createCollection(db, technologyTermsCollection, technologyTermsCollection, [
        Permission.read("any"),
    ]);
    console.log("Technology Terms collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, technologyTermsCollection, "term", 100, true),
        databases.createStringAttribute(db, technologyTermsCollection, "aliases", 10000, false), // JSON array of string aliases
        databases.createIntegerAttribute(db, technologyTermsCollection, "frequency", false, 0),
    ]);
    console.log("Technology Terms Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, technologyTermsCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed`);
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, technologyTermsCollection, "term_unique", "unique", ["term"]),
    ]);
    console.log("Technology Terms indexes created");
}
