/**
 * Phase 3 — Backfill Strategy for Existing Users
 *
 * For every user with a non-zero reputation, writes a single synthetic
 * `historical_baseline` event anchored to their account creation date.
 *
 * This is not historically accurate — it does not reconstruct how the user
 * earned their reputation over time. It correctly anchors the starting point
 * so the trajectory widget has a baseline to measure forward from.
 *
 * Step 3.2: Events are marked isSynthetic = true so the trajectory engine
 * can exclude them when computing real forward-looking trajectory.
 *
 * Step 3.4: Processes users in batches of 100 with a 300ms delay between
 * batches to avoid overwhelming Appwrite's rate limits.
 *
 * Run with:
 *   npx tsx scripts/backfill-reputation-events.ts
 *
 * Safe to re-run: skips users who already have a baseline event.
 */

import * as fs from "fs";
import { Client, Databases, ID, Query, Users } from "node-appwrite";

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

const DB_ID                  = "6a2bbffd00190eccf0b8";
const REPUTATION_EVENTS_COLL = "reputation_events";

const BATCH_SIZE  = 100;   // users per batch  (Step 3.4)
const BATCH_DELAY = 300;   // ms between batches

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Client()
    .setEndpoint(ENDPOINT)
    .setProject(PROJECT_ID)
    .setKey(API_KEY);

const users     = new Users(client);
const databases = new Databases(client);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch every Appwrite user account, paginated.
 * Appwrite Users.list supports offset-based pagination.
 */
async function fetchAllUsers() {
    const allUsers: any[] = [];
    let offset = 0;

    for (;;) {
        const page = await users.list([
            Query.limit(BATCH_SIZE),
            Query.offset(offset),
        ]);

        allUsers.push(...page.users);

        if (page.users.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
    }

    return allUsers;
}

/**
 * Check whether a baseline event already exists for this user.
 * Makes the script safe to re-run without creating duplicate baselines.
 */
async function baselineAlreadyExists(userId: string): Promise<boolean> {
    const result = await databases.listDocuments(DB_ID, REPUTATION_EVENTS_COLL, [
        Query.equal("userId", userId),
        Query.equal("eventType", "historical_baseline"),
        Query.limit(1),
    ]);
    return result.total > 0;
}

/**
 * Write a single synthetic baseline event for one user.
 *
 * Step 3.1: delta = current reputation, reputationAfter = current reputation,
 *           createdAt = account $createdAt (best available anchor point).
 * Step 3.2: isSynthetic = true.
 */
async function writeBaseline(user: any): Promise<"created" | "skipped" | "failed"> {
    const reputation = Number(user.prefs?.reputation ?? 0);

    // Only write baselines for users who actually have reputation to anchor.
    // Zero-reputation users have nothing meaningful to baseline — they will
    // naturally appear in "no real events yet" state (Step 3.3) which is correct.
    if (reputation === 0) return "skipped";

    try {
        const alreadyExists = await baselineAlreadyExists(user.$id);
        if (alreadyExists) return "skipped";

        await databases.createDocument(
            DB_ID,
            REPUTATION_EVENTS_COLL,
            ID.unique(),
            {
                userId:          user.$id,
                delta:           reputation,
                eventType:       "historical_baseline",
                reputationAfter: reputation,
                sourceType:      "system",
                // Anchor to account creation date — closest approximation of
                // when this reputation journey began (Step 3.1).
                createdAt:       user.$createdAt,
                isSynthetic:     true,   // Step 3.2
            }
        );

        return "created";
    } catch (err: any) {
        console.error(
            `  ❌  Failed for userId=${user.$id} name="${user.name}": ${err?.message}`
        );
        return "failed";
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("\n🚀  Phase 3 — Reputation Events Backfill\n");
    console.log("Fetching all users…");

    const allUsers = await fetchAllUsers();
    console.log(`Found ${allUsers.length} user(s) total\n`);

    let created = 0;
    let skipped = 0;
    let failed  = 0;

    // Step 3.4 — process in batches of BATCH_SIZE with a delay between batches
    for (let i = 0; i < allUsers.length; i += BATCH_SIZE) {
        const batch       = allUsers.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allUsers.length / BATCH_SIZE);

        console.log(
            `Processing batch ${batchNumber}/${totalBatches} ` +
            `(users ${i + 1}–${Math.min(i + BATCH_SIZE, allUsers.length)} of ${allUsers.length})…`
        );

        // Process each user in this batch concurrently
        const results = await Promise.all(batch.map(writeBaseline));

        const batchCreated = results.filter((r) => r === "created").length;
        const batchSkipped = results.filter((r) => r === "skipped").length;
        const batchFailed  = results.filter((r) => r === "failed").length;

        created += batchCreated;
        skipped += batchSkipped;
        failed  += batchFailed;

        console.log(
            `  ✓ created: ${batchCreated}  skipped: ${batchSkipped}  failed: ${batchFailed}`
        );

        // Delay between batches — skip after the last one
        if (i + BATCH_SIZE < allUsers.length) {
            await sleep(BATCH_DELAY);
        }
    }

    // ── Summary ────────────────────────────────────────────────────────────────

    console.log("\n─────────────────────────────────────────────────────────");
    console.log("✅  Backfill complete");
    console.log(`   Users found    : ${allUsers.length}`);
    console.log(`   Baselines created : ${created}`);
    console.log(`   Skipped (zero rep or already exists) : ${skipped}`);
    console.log(`   Failed          : ${failed}`);
    console.log("─────────────────────────────────────────────────────────\n");

    // Step 3.3 note — users with zero reputation receive no baseline, which
    // means the trajectory widget will show them the "no real events yet"
    // message. That is intentional and correct behaviour.
    if (skipped > 0) {
        console.log(
            `ℹ️  ${skipped} user(s) were skipped. This includes:\n` +
            `   • Zero-reputation users — the widget will show "no activity yet"\n` +
            `   • Users who already had a baseline from a previous run of this script\n`
        );
    }

    if (failed > 0) {
        console.warn(`⚠️  ${failed} baseline(s) failed to write. Re-run the script to retry.`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("\n❌  Backfill crashed:", err?.message ?? err);
    process.exit(1);
});
