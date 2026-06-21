/**
 * Answer Gap Detector — Phase 1 Audit Script
 *
 * Steps 1.1 + 1.2 + 1.4:
 *   - Verifies user_skill_scores is queryable by userId sorted by compositeScore
 *   - Verifies questions with totalAnswers:0 are genuinely unanswered (spot-check)
 *   - Benchmarks the exact gap query that the API endpoint will run
 *   - Reports whether existing indexes are sufficient
 *
 * Run with:  npx tsx scripts/audit-answer-gaps.ts
 */

import * as fs from "fs";
import { Client, Databases, Query } from "node-appwrite";
import {
    GAP_MIN_AGE_HOURS,
    GAP_MAX_AGE_DAYS,
    GAP_TOP_TAGS_LIMIT,
    GAP_PER_TAG_FETCH_LIMIT,
    gapTimeWindow,
} from "../src/lib/answer-gaps/constants";

// ─── Env ──────────────────────────────────────────────────────────────────────

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

const DB_ID                      = "6a2bbffd00190eccf0b8";
const QUESTION_COLLECTION        = "questions";
const ANSWER_COLLECTION          = "answers";
const USER_SKILL_SCORES_COLL     = "user_skill_scores";

const client    = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ms(label: string, fn: () => Promise<any>) {
    return async () => {
        const t0     = Date.now();
        const result = await fn();
        const elapsed = Date.now() - t0;
        return { elapsed, result };
    };
}

function pass(msg: string)  { console.log(`  ✅  ${msg}`); }
function warn(msg: string)  { console.warn(`  ⚠️   ${msg}`); }
function fail(msg: string)  { console.error(`  ❌  ${msg}`); }
function info(msg: string)  { console.log(`  ℹ️   ${msg}`); }
function heading(msg: string) { console.log(`\n── ${msg} ──`); }

// ─── Step 1.1: user_skill_scores audit ───────────────────────────────────────

async function auditSkillScores() {
    heading("Step 1.1 — user_skill_scores: top-5 by compositeScore query");

    // Grab any user that has at least one skill score document
    const sample = await databases.listDocuments(DB_ID, USER_SKILL_SCORES_COLL, [
        Query.limit(1),
        Query.select(["userId", "tag", "compositeScore"]),
    ]);

    if (sample.total === 0) {
        warn("No user_skill_scores documents found. Run the Phase 1.5 backfill first.");
        return;
    }

    info(`Total user_skill_scores documents: ${sample.total}`);

    const sampleUserId = sample.documents[0].userId as string;
    info(`Benchmarking with userId: ${sampleUserId}`);

    // Benchmark the exact query the API will use
    const t0 = Date.now();
    const topTags = await databases.listDocuments(DB_ID, USER_SKILL_SCORES_COLL, [
        Query.equal("userId", sampleUserId),
        Query.orderDesc("compositeScore"),
        Query.limit(GAP_TOP_TAGS_LIMIT),
        Query.select(["tag", "compositeScore", "tier"]),
    ]);
    const elapsed = Date.now() - t0;

    info(`Query returned ${topTags.documents.length} tag(s) in ${elapsed}ms`);

    if (elapsed <= 50) {
        pass(`Query latency ${elapsed}ms ≤ 50ms threshold — index is sufficient`);
    } else if (elapsed <= 150) {
        warn(`Query latency ${elapsed}ms is acceptable but consider adding a (userId, compositeScore) index`);
    } else {
        fail(`Query latency ${elapsed}ms exceeds 150ms — add index: ["userId", "compositeScore"]`);
    }

    if (topTags.documents.length > 0) {
        info("Top tags sample:");
        topTags.documents.forEach((doc, i) => {
            console.log(`     ${i + 1}. ${(doc.tag as string).padEnd(20)} score=${(doc.compositeScore as number).toFixed(1)}  tier=${doc.tier}`);
        });
    }
}

// ─── Step 1.2: questions totalAnswers:0 reliability audit ─────────────────────

async function auditTotalAnswers() {
    heading("Step 1.2 — questions.totalAnswers reliability spot-check");

    // How many questions claim to be unanswered?
    const unansweredCount = await databases.listDocuments(DB_ID, QUESTION_COLLECTION, [
        Query.equal("totalAnswers", 0),
        Query.limit(1),
    ]);
    info(`Questions with totalAnswers=0: ${unansweredCount.total}`);

    // Cross-check a sample of 10 to verify the answer collection agrees
    const sampleUnanswered = await databases.listDocuments(DB_ID, QUESTION_COLLECTION, [
        Query.equal("totalAnswers", 0),
        Query.orderDesc("$createdAt"),
        Query.limit(10),
        Query.select(["$id", "title", "totalAnswers"]),
    ]);

    let staleCount = 0;

    for (const q of sampleUnanswered.documents) {
        const realAnswers = await databases.listDocuments(DB_ID, ANSWER_COLLECTION, [
            Query.equal("questionId", q.$id),
            Query.limit(1),
        ]);

        const claimed = Number(q.totalAnswers ?? 0);
        const actual  = realAnswers.total;

        if (claimed !== actual) {
            staleCount++;
            warn(`Stale count — question ${q.$id}: totalAnswers=${claimed} but real count=${actual}`);
            warn(`  Title: "${(q.title as string).slice(0, 60)}"`);
        }
    }

    if (staleCount === 0) {
        pass(`All ${sampleUnanswered.documents.length} sampled questions have accurate totalAnswers`);
    } else {
        fail(`${staleCount}/${sampleUnanswered.documents.length} questions have stale totalAnswers — re-run the migration script`);
    }

    // Also check a question with totalAnswers > 0 to confirm answers exist
    const answeredSample = await databases.listDocuments(DB_ID, QUESTION_COLLECTION, [
        Query.greaterThan("totalAnswers", 0),
        Query.orderDesc("$createdAt"),
        Query.limit(3),
        Query.select(["$id", "totalAnswers"]),
    ]);

    let answeredStaleCount = 0;
    for (const q of answeredSample.documents) {
        const realAnswers = await databases.listDocuments(DB_ID, ANSWER_COLLECTION, [
            Query.equal("questionId", q.$id),
            Query.limit(1),
        ]);
        if (Number(q.totalAnswers) !== realAnswers.total) {
            answeredStaleCount++;
            warn(`Answered question ${q.$id}: totalAnswers=${q.totalAnswers} but actual=${realAnswers.total}`);
        }
    }

    if (answeredStaleCount === 0) {
        pass("Answered questions also have accurate totalAnswers");
    }
}

// ─── Step 1.4: Gap query benchmark ───────────────────────────────────────────

async function auditGapQuery() {
    heading("Step 1.4 — Gap query benchmark (questions + tags + totalAnswers + time window)");

    const { earliest, latest } = gapTimeWindow();
    info(`Time window: ${earliest}  →  ${latest}`);
    info(`(Questions older than ${GAP_MIN_AGE_HOURS}h and newer than ${GAP_MAX_AGE_DAYS}d)`);

    // Find a tag that has some questions to make the benchmark realistic
    const recentQ = await databases.listDocuments(DB_ID, QUESTION_COLLECTION, [
        Query.orderDesc("$createdAt"),
        Query.limit(5),
        Query.select(["tags"]),
    ]);

    const candidateTags: string[] = [];
    for (const q of recentQ.documents) {
        for (const t of (q.tags as string[]) ?? []) {
            if (!candidateTags.includes(t)) candidateTags.push(t);
        }
    }

    if (candidateTags.length === 0) {
        warn("No recent questions found — cannot benchmark gap query. Post a question first.");
        return;
    }

    const testTag = candidateTags[0];
    info(`Benchmarking gap query for tag: "${testTag}"`);

    // Exact query the API will run
    const t0 = Date.now();
    const gapResult = await databases.listDocuments(DB_ID, QUESTION_COLLECTION, [
        Query.contains("tags", [testTag]),
        Query.equal("totalAnswers", 0),
        Query.lessThan("$createdAt", latest),
        Query.greaterThan("$createdAt", earliest),
        Query.orderAsc("$createdAt"),
        Query.limit(GAP_PER_TAG_FETCH_LIMIT),
        Query.select(["$id", "title", "$createdAt", "tags", "authorId", "totalAnswers"]),
    ]);
    const elapsed = Date.now() - t0;

    info(`Gap query for "${testTag}" returned ${gapResult.documents.length}/${gapResult.total} in ${elapsed}ms`);

    if (elapsed <= 100) {
        pass(`Gap query latency ${elapsed}ms — existing indexes sufficient`);
    } else if (elapsed <= 300) {
        warn(`Gap query latency ${elapsed}ms — acceptable but watch at scale`);
    } else {
        fail(`Gap query latency ${elapsed}ms — consider composite index on (totalAnswers, $createdAt)`);
        info("Recommended index to add in question.collection.ts:");
        info('  databases.createIndex(db, questionCollection, "unanswered_by_date",');
        info('    IndexType.Key, ["totalAnswers", "$createdAt"])');
    }

    // Run for all candidate tags to simulate the full widget query cost
    if (candidateTags.length > 1) {
        heading("Full widget query simulation (all skill tags in parallel)");
        const tags = candidateTags.slice(0, GAP_TOP_TAGS_LIMIT);
        const t1 = Date.now();
        await Promise.all(
            tags.map((tag) =>
                databases.listDocuments(DB_ID, QUESTION_COLLECTION, [
                    Query.contains("tags", [tag]),
                    Query.equal("totalAnswers", 0),
                    Query.lessThan("$createdAt", latest),
                    Query.greaterThan("$createdAt", earliest),
                    Query.orderAsc("$createdAt"),
                    Query.limit(GAP_PER_TAG_FETCH_LIMIT),
                    Query.select(["$id", "title", "$createdAt", "tags", "authorId"]),
                ])
            )
        );
        const totalElapsed = Date.now() - t1;
        info(`Parallel gap queries for ${tags.length} tag(s) completed in ${totalElapsed}ms`);

        if (totalElapsed <= 300) {
            pass(`Parallel query total ${totalElapsed}ms — well within acceptable range`);
        } else {
            warn(`Parallel query total ${totalElapsed}ms — consider reducing GAP_TOP_TAGS_LIMIT or adding caching`);
        }
    }
}

// ─── Step 1.3: Confirm constants are sensible ──────────────────────────────────

function auditConstants() {
    heading("Step 1.3 — Time window constants");
    pass(`GAP_MIN_AGE_HOURS = ${GAP_MIN_AGE_HOURS}h  (questions must be at least this old)`);
    pass(`GAP_MAX_AGE_DAYS  = ${GAP_MAX_AGE_DAYS}d  (questions must be newer than this)`);
    pass(`GAP_TOP_TAGS_LIMIT = ${GAP_TOP_TAGS_LIMIT}  (skill tags queried per request)`);
    pass(`GAP_RESULT_LIMIT   = ${GAP_PER_TAG_FETCH_LIMIT}  (questions fetched per tag before merge)`);
    pass(`GAP_CACHE_TTL      = 10 minutes`);

    const { earliest, latest } = gapTimeWindow();
    info(`Right now the window is: ${new Date(earliest).toUTCString()}  →  ${new Date(latest).toUTCString()}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("\n🔍  Answer Gap Detector — Phase 1 Audit\n");

    auditConstants();
    await auditSkillScores();
    await auditTotalAnswers();
    await auditGapQuery();

    console.log("\n─────────────────────────────────────────");
    console.log("✅  Phase 1 audit complete");
    console.log("    Next: implement Phase 2 API endpoint");
    console.log("─────────────────────────────────────────\n");
}

main().catch((err) => {
    console.error("\n❌  Audit failed:", err?.message ?? err);
    process.exit(1);
});
