import { IndexType } from "node-appwrite";
import { db, answerCollection, questionCollection } from "../src/models/name";
import { databases } from "../src/models/server/config";

async function addMissingSchema() {
  console.log("Adding Phase 8 schema (search & sort integration)...");

  try {
    console.log("Adding answerFreshnessIndicator to questions collection...");
    const attribute = await databases.createEnumAttribute(
      db,
      questionCollection,
      "answerFreshnessIndicator",
      ["fresh", "outdated", "none"],
      false,
      "none"
    );

    for (let attempt = 0; attempt < 60; attempt++) {
      const current: any = await databases.getAttribute(db, questionCollection, attribute.key);
      if (current.status === "available") break;
      if (current.status === "failed") {
        throw new Error(`Question attribute ${attribute.key} failed to initialize`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    console.log("answerFreshnessIndicator attribute ready.");

    await databases.createIndex(
      db,
      questionCollection,
      "answer_freshness_indicator_filter",
      IndexType.Key,
      ["answerFreshnessIndicator"]
    );
    console.log("answer_freshness_indicator_filter index created.");
  } catch (err: any) {
    if (err?.code === 409) {
      console.log("answerFreshnessIndicator already exists (409 Conflict). Skipping.");
    } else {
      console.error(err);
    }
  }

  try {
    console.log("Adding freshness_score_sort index to answers collection...");
    await databases.createIndex(db, answerCollection, "freshness_score_sort", IndexType.Key, ["freshnessScore"]);
    console.log("freshness_score_sort index created.");
  } catch (err: any) {
    if (err?.code === 409) {
      console.log("freshness_score_sort index already exists (409 Conflict). Skipping.");
    } else {
      console.error(err);
    }
  }

  console.log("Backfilling answerFreshnessIndicator for existing questions...");
  await backfillExistingQuestions();
  console.log("Backfill complete.");
}

async function backfillExistingQuestions() {
  const { recomputeQuestionFreshnessIndicator } = await import("../src/lib/decay/question-freshness-indicator");
  const { listAllDocuments } = await import("../src/lib/appwrite-pagination");
  const { Query } = await import("node-appwrite");

  const { documents: questions } = await listAllDocuments(questionCollection, [Query.select(["$id"])]);

  for (const question of questions) {
    await recomputeQuestionFreshnessIndicator(question.$id);
  }

  console.log(`Backfilled ${questions.length} questions.`);
}

addMissingSchema();
