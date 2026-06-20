/**
 * Phase 1 — Step 1.5: Backfill Migration
 * 
 * Creates empty user_skill_scores documents for all users who have any
 * existing activity (questions or answers) so they appear in the system
 * on launch day. Scores start at 0 and will be populated by Phase 2.
 *
 * Run with: npx tsx scripts/migrate-skill-scores-backfill.ts
 */

import { Client, Databases, Query, ID } from "node-appwrite";
import * as fs from "fs";

// ─── Load env ─────────────────────────────────────────────────────────────────

const env = fs
    .readFileSync(".env", "utf8")
    .split("\n")
    .reduce<Record<string, string>>((acc, line) => {
        const [key, ...val] = line.split("=");
        if (key?.trim()) acc[key.trim()] = val.join("=").trim().replace(/"/g, "");
        return acc;
    }, {});

const ENDPOINT   = env.NEXT_PUBLIC_APPWRITE_HOST_URL;
const PROJECT_ID = env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY    = env.APPWRITE_API_KEY;

if (!ENDPOINT || !PROJECT_ID || !API_KEY) {
    throw new Error("Missing required Appwrite environment variables in .env");
}

const DB_ID                     = "6a2bbffd00190eccf0b8";
const QUESTION_COLLECTION       = "questions";
const ANSWER_COLLECTION         = "answers";
const USER_SKILL_SCORES_COLL    = "user_skill_scores";

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function listAll<T>(
    collectionId: string,
    queries: string[] = []
): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | undefined;

    for (;;) {
        const page = await databases.listDocuments(DB_ID, collectionId, [
            ...queries,
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);

        results.push(...(page.documents as T[]));

        if (page.documents.length < 100 || results.length >= page.total) break;
        cursor = page.documents[page.documents.length - 1].$id;
    }

    return results;
}

async function skillScoreExists(userId: string, tag: string): Promise<boolean> {
    const result = await databases.listDocuments(DB_ID, USER_SKILL_SCORES_COLL, [
        Query.equal("userId", userId),
        Query.equal("tag", tag),
        Query.limit(1),
    ]);
    return result.total > 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("\n🚀  Phase 1.5 — Skill Scores Backfill\n");

    // 1. Collect all questions → map authorId → Set<tag>
    console.log("Fetching all questions...");
    const questions = await listAll<any>(QUESTION_COLLECTION, [
        Query.select(["authorId", "tags"]),
    ]);
    console.log(`  Found ${questions.length} questions`);

    // 2. Collect all answers → map authorId → Set<questionId>
    console.log("Fetching all answers...");
    const answers = await listAll<any>(ANSWER_COLLECTION, [
        Query.select(["authorId", "questionId"]),
    ]);
    console.log(`  Found ${answers.length} answers`);

    // Build a map: questionId → tags
    const questionTagsMap = new Map<string, string[]>();
    for (const q of questions) {
        if (q.$id && Array.isArray(q.tags)) {
            questionTagsMap.set(q.$id, q.tags);
        }
    }

    // Build a map: userId → Set<tag>
    const userTagsMap = new Map<string, Set<string>>();

    const ensureUserTags = (userId: string) => {
        if (!userTagsMap.has(userId)) userTagsMap.set(userId, new Set());
        return userTagsMap.get(userId)!;
    };

    for (const q of questions) {
        if (!q.authorId || !Array.isArray(q.tags)) continue;
        const tags = ensureUserTags(q.authorId);
        q.tags.forEach((t: string) => tags.add(t));
    }

    for (const a of answers) {
        if (!a.authorId || !a.questionId) continue;
        const questionTags = questionTagsMap.get(a.questionId) ?? [];
        if (questionTags.length === 0) continue;
        const tags = ensureUserTags(a.authorId);
        questionTags.forEach((t) => tags.add(t));
    }

    console.log(`\nFound ${userTagsMap.size} unique users with activity`);

    let created = 0;
    let skipped = 0;
    let failed  = 0;
    const now = new Date().toISOString();

    const userEntries = Array.from(userTagsMap.entries());

    // Process in batches of 50 users at a time
    const BATCH_SIZE = 50;
    for (let i = 0; i < userEntries.length; i += BATCH_SIZE) {
        const batch = userEntries.slice(i, i + BATCH_SIZE);
        console.log(`\nProcessing users ${i + 1}–${Math.min(i + BATCH_SIZE, userEntries.length)} of ${userEntries.length}...`);

        await Promise.all(
            batch.map(async ([userId, tags]) => {
                for (const tag of Array.from(tags)) {
                    try {
                        if (await skillScoreExists(userId, tag)) {
                            skipped++;
                            continue;
                        }

                        await databases.createDocument(
                            DB_ID,
                            USER_SKILL_SCORES_COLL,
                            ID.unique(),
                            {
                                userId,
                                tag,
                                answerQualityScore: 0,
                                questionQualityScore: 0,
                                temporalConsistencyScore: 0,
                                peerValidationScore: 0,
                                compositeScore: 0,
                                tier: "Newcomer",
                                scoreSevenDaysAgo: 0,
                                trendDirection: "stable",
                                totalAnswers: 0,
                                acceptedAnswers: 0,
                                totalQuestions: 0,
                                totalUpvotesReceived: 0,
                                lastCalculatedAt: now,
                                lastActivityAt: now,
                            }
                        );
                        created++;
                    } catch (err: any) {
                        console.error(`  ❌  Failed for user=${userId} tag=${tag}: ${err?.message}`);
                        failed++;
                    }
                }
            })
        );

        // Small delay between user batches to avoid overwhelming Appwrite
        if (i + BATCH_SIZE < userEntries.length) {
            await new Promise((r) => setTimeout(r, 300));
        }
    }

    console.log("\n─────────────────────────────────────────");
    console.log(`✅  Backfill complete`);
    console.log(`   Created : ${created}`);
    console.log(`   Skipped : ${skipped} (already existed)`);
    console.log(`   Failed  : ${failed}`);
    console.log("─────────────────────────────────────────\n");
    console.log("Next step: run Phase 2 to populate actual scores.");
}

main().catch((err) => {
    console.error("❌  Backfill failed:", err?.message ?? err);
    process.exit(1);
});
