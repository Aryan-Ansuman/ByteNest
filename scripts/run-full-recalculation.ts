/**
 * Phase 2 — Full Recalculation CLI Script
 *
 * Run with:
 *   npx tsx scripts/run-full-recalculation.ts              # all users
 *   npx tsx scripts/run-full-recalculation.ts <userId>     # single user
 */

import * as fs from "fs";
import { Client, Databases, Users, Query } from "node-appwrite";

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

// We can't import from @/ paths directly in a raw tsx script,
// so we re-implement the minimal wiring needed to call the calculator.
// The scoring library is imported via the compiled module path.

import { recalculateAllTagsForUser, batchRecalculateUsers } from "../src/lib/skills/full-user-recalculation";

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const targetUserId = process.argv[2];

    if (targetUserId) {
        // Single-user mode
        console.log(`\n🔄  Recalculating all tags for user: ${targetUserId}\n`);
        const results = await recalculateAllTagsForUser(targetUserId, "backfill");

        console.log(`\n✅  Done — ${results.length} tag(s) processed:`);
        for (const r of results) {
            const changed = r.tierChanged ? ` ⬆ tier changed!` : "";
            console.log(
                `   ${r.tag.padEnd(20)} ${r.previousScore.toFixed(1)} → ${r.compositeScore.toFixed(1)} [${r.tier}]${changed}`
            );
        }
        return;
    }

    // All-users mode
    console.log("\n🔄  Recalculating scores for ALL users\n");

    // Fetch all user IDs (paginated)
    const client = new Client()
        .setEndpoint(ENDPOINT)
        .setProject(PROJECT_ID)
        .setKey(API_KEY);

    const users = new Users(client);
    const userIds: string[] = [];
    let offset = 0;

    for (;;) {
        const page = await users.list([Query.limit(100), Query.offset(offset)]);
        userIds.push(...page.users.map((u) => u.$id));
        if (page.users.length < 100) break;
        offset += 100;
    }

    console.log(`Found ${userIds.length} user(s)`);

    const { processed, failed } = await batchRecalculateUsers(userIds, {
        batchSize: 50,
        delayMs:   300,
        onUserComplete: (userId, results) => {
            console.log(`  ✓ ${userId} — ${results.length} tag(s)`);
        },
        onUserError: (userId, err: any) => {
            console.error(`  ✗ ${userId} — ${err?.message}`);
        },
    });

    console.log("\n─────────────────────────────────────────");
    console.log(`✅  Recalculation complete`);
    console.log(`   Processed : ${processed}`);
    console.log(`   Failed    : ${failed}`);
    console.log("─────────────────────────────────────────\n");
}

main().catch((err) => {
    console.error("❌  Recalculation failed:", err?.message ?? err);
    process.exit(1);
});
