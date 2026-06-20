/**
 * Phase 1 — Database Foundation
 * Run with: npx tsx scripts/setup-skill-collections.ts
 *
 * Creates:
 *  1. user_skill_scores collection
 *  2. skill_calculation_events collection
 *  3. tag_expert_registry collection
 *  4. All required indexes
 */

import { Client, Databases, IndexType } from "node-appwrite";
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

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_ID = "6a2bbffd00190eccf0b8"; // same db as the rest of the app

export const userSkillScoresCollection  = "user_skill_scores";
export const skillCalcEventsCollection  = "skill_calculation_events";
export const tagExpertRegistryCollection = "tag_expert_registry";

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const databases = new Databases(client);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function waitForAttribute(collectionId: string, attributeKey: string) {
    for (let attempt = 0; attempt < 120; attempt++) {
        const attr: any = await databases.getAttribute(DB_ID, collectionId, attributeKey);
        if (attr.status === "available") return;
        if (attr.status === "failed")
            throw new Error(`Attribute ${attributeKey} failed to initialize`);
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Timed out waiting for attribute ${attributeKey}`);
}

async function waitForAllAttributes(collectionId: string, keys: string[]) {
    await Promise.all(keys.map((k) => waitForAttribute(collectionId, k)));
}

async function collectionExists(collectionId: string): Promise<boolean> {
    try {
        await databases.getCollection(DB_ID, collectionId);
        return true;
    } catch {
        return false;
    }
}

// ─── Step 1.1 — user_skill_scores ─────────────────────────────────────────────

async function createUserSkillScoresCollection() {
    if (await collectionExists(userSkillScoresCollection)) {
        console.log("⚠️  user_skill_scores already exists — skipping creation");
        return;
    }

    await databases.createCollection(
        DB_ID,
        userSkillScoresCollection,
        "User Skill Scores",
        [
            "read(\"any\")",
            "create(\"users\")",
            "update(\"users\")",
            "delete(\"users\")",
        ]
    );
    console.log("✅  user_skill_scores collection created");

    await Promise.all([
        // Identifies which user this score belongs to
        databases.createStringAttribute(DB_ID, userSkillScoresCollection, "userId", 50, true),
        // The tag (technology) for which the score was computed
        databases.createStringAttribute(DB_ID, userSkillScoresCollection, "tag", 50, true),

        // ── Sub-scores (all floats 0–100) ──────────────────────────────────
        databases.createFloatAttribute(DB_ID, userSkillScoresCollection, "answerQualityScore", false, 0, 100, 0),
        databases.createFloatAttribute(DB_ID, userSkillScoresCollection, "questionQualityScore", false, 0, 100, 0),
        databases.createFloatAttribute(DB_ID, userSkillScoresCollection, "temporalConsistencyScore", false, 0, 100, 0),
        databases.createFloatAttribute(DB_ID, userSkillScoresCollection, "peerValidationScore", false, 0, 100, 0),

        // ── Composite score (0–100) and tier label ─────────────────────────
        databases.createFloatAttribute(DB_ID, userSkillScoresCollection, "compositeScore", false, 0, 100, 0),
        // Newcomer | Apprentice | Practitioner | Expert | Authority
        databases.createEnumAttribute(
            DB_ID,
            userSkillScoresCollection,
            "tier",
            ["Newcomer", "Apprentice", "Practitioner", "Expert", "Authority"],
            false,
            "Newcomer"
        ),

        // ── Trend tracking ─────────────────────────────────────────────────
        // Score 7 days ago — used to display trend arrows in the UI
        databases.createFloatAttribute(DB_ID, userSkillScoresCollection, "scoreSevenDaysAgo", false, 0, 100, 0),
        // up | stable | down
        databases.createEnumAttribute(
            DB_ID,
            userSkillScoresCollection,
            "trendDirection",
            ["up", "stable", "down"],
            false,
            "stable"
        ),

        // ── Raw activity counts ────────────────────────────────────────────
        databases.createIntegerAttribute(DB_ID, userSkillScoresCollection, "totalAnswers", false, 0, undefined, 0),
        databases.createIntegerAttribute(DB_ID, userSkillScoresCollection, "acceptedAnswers", false, 0, undefined, 0),
        databases.createIntegerAttribute(DB_ID, userSkillScoresCollection, "totalQuestions", false, 0, undefined, 0),
        databases.createIntegerAttribute(DB_ID, userSkillScoresCollection, "totalUpvotesReceived", false, 0, undefined, 0),

        // ── Timestamps ────────────────────────────────────────────────────
        databases.createDatetimeAttribute(DB_ID, userSkillScoresCollection, "lastCalculatedAt", false),
        databases.createDatetimeAttribute(DB_ID, userSkillScoresCollection, "lastActivityAt", false),
    ]);

    console.log("✅  user_skill_scores attributes created");

    // Wait for all attributes to be available before creating indexes
    await waitForAllAttributes(userSkillScoresCollection, [
        "userId", "tag", "compositeScore", "tier", "lastCalculatedAt",
    ]);

    // ── Step 1.4 — Indexes ──────────────────────────────────────────────────
    await Promise.all([
        // Look up all skill scores for a given user
        databases.createIndex(DB_ID, userSkillScoresCollection, "userId_index", IndexType.Key, ["userId"]),
        // Look up all users who have a score for a given tag
        databases.createIndex(DB_ID, userSkillScoresCollection, "tag_index", IndexType.Key, ["tag"]),
        // Unique per user-tag pair (prevents duplicate documents)
        databases.createIndex(DB_ID, userSkillScoresCollection, "userId_tag_unique", IndexType.Unique, ["userId", "tag"]),
        // Sorted leaderboard per tag
        databases.createIndex(DB_ID, userSkillScoresCollection, "tag_score_sort", IndexType.Key, ["tag", "compositeScore"]),
        // Decay job: find stale documents efficiently
        databases.createIndex(DB_ID, userSkillScoresCollection, "lastCalculatedAt_index", IndexType.Key, ["lastCalculatedAt"]),
    ]);

    console.log("✅  user_skill_scores indexes created");
}

// ─── Step 1.2 — skill_calculation_events ──────────────────────────────────────

async function createSkillCalculationEventsCollection() {
    if (await collectionExists(skillCalcEventsCollection)) {
        console.log("⚠️  skill_calculation_events already exists — skipping creation");
        return;
    }

    await databases.createCollection(
        DB_ID,
        skillCalcEventsCollection,
        "Skill Calculation Events",
        [
            "read(\"users\")",
            "create(\"users\")",
            "update(\"users\")",
            "delete(\"users\")",
        ]
    );
    console.log("✅  skill_calculation_events collection created");

    await Promise.all([
        databases.createStringAttribute(DB_ID, skillCalcEventsCollection, "userId", 50, true),
        databases.createStringAttribute(DB_ID, skillCalcEventsCollection, "tag", 50, true),
        // vote_cast | answer_posted | answer_accepted | question_posted | decay_run | backfill
        databases.createEnumAttribute(
            DB_ID,
            skillCalcEventsCollection,
            "triggerType",
            ["vote_cast", "answer_posted", "answer_accepted", "question_posted", "decay_run", "backfill"],
            true
        ),
        // low | normal | high
        databases.createEnumAttribute(
            DB_ID,
            skillCalcEventsCollection,
            "priority",
            ["low", "normal", "high"],
            false,
            "normal"
        ),
        // pending | processing | completed | failed
        databases.createEnumAttribute(
            DB_ID,
            skillCalcEventsCollection,
            "status",
            ["pending", "processing", "completed", "failed"],
            false,
            "pending"
        ),
        // Score before this recalculation
        databases.createFloatAttribute(DB_ID, skillCalcEventsCollection, "previousScore", false, 0, 100, 0),
        // Score after this recalculation
        databases.createFloatAttribute(DB_ID, skillCalcEventsCollection, "newScore", false, 0, 100, 0),
        // Optional: the document ID that triggered this event (e.g. vote ID, answer ID)
        databases.createStringAttribute(DB_ID, skillCalcEventsCollection, "sourceDocumentId", 50, false),
        // ISO timestamp when the job was scheduled
        databases.createDatetimeAttribute(DB_ID, skillCalcEventsCollection, "scheduledAt", false),
        // ISO timestamp when the job finished
        databases.createDatetimeAttribute(DB_ID, skillCalcEventsCollection, "completedAt", false),
        // Error message if status === "failed"
        databases.createStringAttribute(DB_ID, skillCalcEventsCollection, "errorMessage", 500, false),
    ]);

    console.log("✅  skill_calculation_events attributes created");

    await waitForAllAttributes(skillCalcEventsCollection, [
        "userId", "tag", "triggerType", "status", "priority", "scheduledAt",
    ]);

    await Promise.all([
        databases.createIndex(DB_ID, skillCalcEventsCollection, "userId_index", IndexType.Key, ["userId"]),
        databases.createIndex(DB_ID, skillCalcEventsCollection, "tag_index", IndexType.Key, ["tag"]),
        databases.createIndex(DB_ID, skillCalcEventsCollection, "userId_tag_index", IndexType.Key, ["userId", "tag"]),
        databases.createIndex(DB_ID, skillCalcEventsCollection, "status_index", IndexType.Key, ["status"]),
        databases.createIndex(DB_ID, skillCalcEventsCollection, "scheduledAt_index", IndexType.Key, ["scheduledAt"]),
        // Debounce check: find recent events for a user-tag pair
        databases.createIndex(DB_ID, skillCalcEventsCollection, "userId_tag_status_index", IndexType.Key, ["userId", "tag", "status"]),
    ]);

    console.log("✅  skill_calculation_events indexes created");
}

// ─── Step 1.3 — tag_expert_registry ───────────────────────────────────────────

async function createTagExpertRegistryCollection() {
    if (await collectionExists(tagExpertRegistryCollection)) {
        console.log("⚠️  tag_expert_registry already exists — skipping creation");
        return;
    }

    await databases.createCollection(
        DB_ID,
        tagExpertRegistryCollection,
        "Tag Expert Registry",
        [
            "read(\"any\")",
            "create(\"users\")",
            "update(\"users\")",
            "delete(\"users\")",
        ]
    );
    console.log("✅  tag_expert_registry collection created");

    await Promise.all([
        databases.createStringAttribute(DB_ID, tagExpertRegistryCollection, "tag", 50, true),
        databases.createStringAttribute(DB_ID, tagExpertRegistryCollection, "userId", 50, true),
        databases.createStringAttribute(DB_ID, tagExpertRegistryCollection, "userName", 100, false),
        databases.createFloatAttribute(DB_ID, tagExpertRegistryCollection, "compositeScore", false, 0, 100, 0),
        databases.createEnumAttribute(
            DB_ID,
            tagExpertRegistryCollection,
            "tier",
            ["Newcomer", "Apprentice", "Practitioner", "Expert", "Authority"],
            false,
            "Newcomer"
        ),
        // Rank position in the registry for this tag (1 = top expert)
        databases.createIntegerAttribute(DB_ID, tagExpertRegistryCollection, "rank", false, 1, undefined, 1),
        // When this registry entry was last rebuilt
        databases.createDatetimeAttribute(DB_ID, tagExpertRegistryCollection, "builtAt", false),
    ]);

    console.log("✅  tag_expert_registry attributes created");

    await waitForAllAttributes(tagExpertRegistryCollection, [
        "tag", "userId", "compositeScore", "rank", "builtAt",
    ]);

    await Promise.all([
        databases.createIndex(DB_ID, tagExpertRegistryCollection, "tag_index", IndexType.Key, ["tag"]),
        databases.createIndex(DB_ID, tagExpertRegistryCollection, "userId_index", IndexType.Key, ["userId"]),
        databases.createIndex(DB_ID, tagExpertRegistryCollection, "tag_unique", IndexType.Unique, ["tag", "userId"]),
        // Leaderboard: top N experts for a tag sorted by score desc
        databases.createIndex(DB_ID, tagExpertRegistryCollection, "tag_score_sort", IndexType.Key, ["tag", "compositeScore"]),
        // Leaderboard by rank
        databases.createIndex(DB_ID, tagExpertRegistryCollection, "tag_rank_sort", IndexType.Key, ["tag", "rank"]),
    ]);

    console.log("✅  tag_expert_registry indexes created");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("\n🚀  Phase 1 — Database Foundation\n");

    await createUserSkillScoresCollection();
    await createSkillCalculationEventsCollection();
    await createTagExpertRegistryCollection();

    console.log("\n🎉  Phase 1 complete — all collections and indexes created\n");
}

main().catch((err) => {
    console.error("❌  Setup failed:", err?.message ?? err);
    process.exit(1);
});
