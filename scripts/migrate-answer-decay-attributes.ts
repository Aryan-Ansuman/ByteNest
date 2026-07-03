import { IndexType } from "node-appwrite";
import { db, answerCollection } from "../src/models/name";
import { databases } from "../src/models/server/config";

async function addMissingAttributes() {
  console.log("Adding Phase 4 attributes to answers collection...");
  try {
    const attributes = await Promise.all([
      databases.createStringAttribute(db, answerCollection, "versionMin", 30, false),
      databases.createStringAttribute(db, answerCollection, "versionMax", 30, false),
      databases.createStringAttribute(db, answerCollection, "techPackage", 100, false),
      databases.createEnumAttribute(db, answerCollection, "techEcosystem", ["npm", "pypi", "crates", "github"], false),
      databases.createFloatAttribute(db, answerCollection, "freshnessScore", false, 0, 100, 100),
      databases.createEnumAttribute(db, answerCollection, "freshnessLabel", ["fresh", "aging", "outdated", "stale"], false, "fresh"),
      databases.createIntegerAttribute(db, answerCollection, "stalenessVoteCount", false, undefined, undefined, 0),
      databases.createDatetimeAttribute(db, answerCollection, "lastFreshnessCheck", false),
      databases.createDatetimeAttribute(db, answerCollection, "verifiedByAuthorAt", false),
      databases.createDatetimeAttribute(db, answerCollection, "freshnessNotifiedAt", false),
    ]);
    console.log("Attributes creation requested. Waiting for availability...");
    
    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, answerCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`Answer attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for answer attribute ${attribute.key}`);
        })
    );
    
    console.log("Creating indexes...");
    await Promise.all([
        databases.createIndex(db, answerCollection, "freshness_label_filter", IndexType.Key, ["freshnessLabel"]),
        databases.createIndex(db, answerCollection, "last_freshness_check_sort", IndexType.Key, ["lastFreshnessCheck"]),
    ]);
    console.log("Indexes created successfully!");
  } catch (err: any) {
    if (err?.code === 409) {
      console.log("Attributes already exist (409 Conflict). Skipping.");
    } else {
      console.error(err);
    }
  }
}

addMissingAttributes();
