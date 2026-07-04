import { IndexType } from "node-appwrite";
import { db, questionCollection, systemConfigCollection } from "../src/models/name";
import { databases } from "../src/models/server/config";

async function addAttributeIfMissing(
  collectionId: string,
  key: string,
  create: () => Promise<any>
) {
  try {
    const attribute = await create();
    for (let attempt = 0; attempt < 60; attempt++) {
      const current: any = await databases.getAttribute(db, collectionId, attribute.key);
      if (current.status === "available") return;
      if (current.status === "failed") throw new Error(`Attribute ${attribute.key} failed to initialize`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for attribute ${key}`);
  } catch (err: any) {
    if (err?.code === 409) {
      console.log(`${collectionId}.${key} already exists (409 Conflict). Skipping.`);
    } else {
      throw err;
    }
  }
}

async function addIndexIfMissing(collectionId: string, indexKey: string, create: () => Promise<any>) {
  try {
    await create();
    console.log(`${collectionId}.${indexKey} index created.`);
  } catch (err: any) {
    if (err?.code === 409) {
      console.log(`${collectionId}.${indexKey} index already exists (409 Conflict). Skipping.`);
    } else {
      throw err;
    }
  }
}

async function migrate() {
  console.log("Adding Phase 5 (Code Smell Auto-Tagger — LLM layer) schema...");

  // ─── Question collection — the Phase 1 subset Phase 5 needs ────────────
  // All these attributes have been created successfully. Appwrite will throw
  // 400 limit exceeded instead of 409 if we try to create an already-existing attribute
  // while the collection is near its size limit.

  // ─── system_config collection — LLM daily-cap + usage-counter fields ───
  // Shared collection (also used for scoring weights / embedding model
  // config), so these are just two more optional attributes on it — one
  // doc (`code_smell_llm`) stores the cap, one doc per day
  // (`code_smell_llm_usage_YYYY-MM-DD`) stores that day's call count.
  await addAttributeIfMissing(systemConfigCollection, "dailyCallCap", () =>
    databases.createIntegerAttribute(db, systemConfigCollection, "dailyCallCap", false, 0, undefined, undefined)
  );
  await addAttributeIfMissing(systemConfigCollection, "callCount", () =>
    databases.createIntegerAttribute(db, systemConfigCollection, "callCount", false, 0, undefined, 0)
  );

  // Seed the cap config doc if it doesn't exist yet.
  try {
    await databases.getDocument(db, systemConfigCollection, "code_smell_llm");
    console.log("code_smell_llm config doc already exists. Skipping seed.");
  } catch (err: any) {
    if (err?.code === 404) {
      await databases.createDocument(db, systemConfigCollection, "code_smell_llm", {
        dailyCallCap: 200,
      });
      console.log("Seeded code_smell_llm config doc with dailyCallCap=200.");
    } else {
      throw err;
    }
  }

  console.log("Phase 5 migration complete.");
}

migrate();
