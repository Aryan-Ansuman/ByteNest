// scripts/test-code-extraction.ts
// Run with `npx tsx scripts/test-code-extraction.ts`
//
// Code Smell Auto-Tagger — Phase 2. Pulls a real sample of questions from
// the live `questions` collection and runs the extraction module against
// each one, printing what it found (or didn't). This is the "test with 20
// real question bodies" step the plan calls for — run this BEFORE Phase 3
// gets built on top of the extractor, since edge cases here (nested
// backticks, inline vs. block code, blockquoted code) are cheap to fix now
// and expensive to fix once the rule engine depends on this contract.
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, questionCollection } from "@/models/name";
import { extractCodeBlocks } from "@/lib/smells/extract-code-blocks";

const SAMPLE_SIZE = 20;

async function main() {
  console.log(`Pulling ${SAMPLE_SIZE} real questions to test extraction against...\n`);

  const result = await databases.listDocuments(db, questionCollection, [
    Query.limit(SAMPLE_SIZE),
    Query.orderDesc("$createdAt"),
    Query.select(["$id", "title", "content"]),
  ]);

  let totalBlocks = 0;
  let questionsWithCode = 0;
  let questionsWithoutFences = 0;
  const languageCounts: Record<string, number> = {};
  const confidenceCounts: Record<string, number> = { explicit: 0, inferred: 0 };
  const flaggedForReview: Array<{ id: string; title: string; reason: string }> = [];

  for (const doc of result.documents) {
    const content = (doc.content as string) ?? "";
    const blocks = extractCodeBlocks(content);

    if (!content.includes("```")) {
      questionsWithoutFences += 1;
    } else if (blocks.length === 0) {
      // Content has fence markers but extraction found nothing usable —
      // worth a manual look (could be an empty fence, could be a real bug).
      flaggedForReview.push({ id: doc.$id, title: doc.title as string, reason: "has ``` but extracted 0 blocks" });
    }

    if (blocks.length > 0) {
      questionsWithCode += 1;
      totalBlocks += blocks.length;
    }

    for (const block of blocks) {
      languageCounts[block.language] = (languageCounts[block.language] ?? 0) + 1;
      confidenceCounts[block.languageConfidence] += 1;

      // Sanity-check the line range makes sense relative to the content.
      const contentLineCount = content.split("\n").length;
      if (block.lineEnd > contentLineCount) {
        flaggedForReview.push({
          id: doc.$id,
          title: doc.title as string,
          reason: `lineEnd (${block.lineEnd}) exceeds content's actual line count (${contentLineCount})`,
        });
      }
    }

    console.log(
      `${doc.$id} — "${(doc.title as string).slice(0, 60)}" — ${blocks.length} block(s): ` +
      blocks.map((b) => `${b.language}(${b.languageConfidence}, L${b.lineStart}-${b.lineEnd})`).join(", ")
    );
  }

  console.log("\n── Summary ──");
  console.log(`Questions sampled: ${result.documents.length}`);
  console.log(`Questions with extracted code: ${questionsWithCode}`);
  console.log(`Questions with no fence markers at all: ${questionsWithoutFences}`);
  console.log(`Total code blocks extracted: ${totalBlocks}`);
  console.log(`Language breakdown:`, languageCounts);
  console.log(`Confidence breakdown:`, confidenceCounts);

  if (flaggedForReview.length > 0) {
    console.log(`\n⚠️  ${flaggedForReview.length} item(s) flagged for manual review:`);
    for (const item of flaggedForReview) {
      console.log(`  - ${item.id} ("${item.title.slice(0, 50)}"): ${item.reason}`);
    }
  } else {
    console.log("\n✅ No anomalies flagged.");
  }
}

main();
