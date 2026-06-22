/**
 * Reputation Trajectory — Phase 10: Observability
 * Step 10.1: Log trajectory distribution periodically
 *
 * A weekly job that counts how many users are Climbing, Stable, and Declining.
 * Gives a platform health signal. If the Declining percentage exceeds 40%,
 * the reputation system may need rebalancing.
 *
 * Run with:  npx tsx scripts/log-trajectory-distribution.ts
 */

import * as fs from "fs";
import { Client, Databases, Query } from "node-appwrite";
import { computeReputationTrajectory, type ReputationEvent } from "../src/lib/trajectory-engine";

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

const DB_ID = "6a2bbffd00190eccf0b8";
const REPUTATION_EVENTS_COLLECTION = "reputation_events";
const USERS_COLLECTION = "users";

const client    = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function fetchAllActiveUsersInWindow(windowStart: string): Promise<string[]> {
    const userIds = new Set<string>();
    let cursor: string | undefined;

    console.log("Fetching distinct users from recent reputation events...");

    for (;;) {
        const page = await databases.listDocuments(DB_ID, REPUTATION_EVENTS_COLLECTION, [
            Query.greaterThanEqual("createdAt", windowStart),
            Query.equal("isSynthetic", false),
            Query.select(["userId"]),
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);

        for (const doc of page.documents) {
            userIds.add(doc.userId as string);
        }

        if (page.documents.length < 100) break;
        cursor = page.documents[page.documents.length - 1].$id;
    }

    return Array.from(userIds);
}

async function fetchUserEvents(userId: string, windowStart: string): Promise<ReputationEvent[]> {
    const events: ReputationEvent[] = [];
    let cursor: string | undefined;

    for (;;) {
        const page = await databases.listDocuments(DB_ID, REPUTATION_EVENTS_COLLECTION, [
            Query.equal("userId", userId),
            Query.equal("isSynthetic", false),
            Query.greaterThanEqual("createdAt", windowStart),
            Query.orderAsc("createdAt"),
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);

        events.push(...(page.documents as unknown as ReputationEvent[]));

        if (page.documents.length < 100) break;
        cursor = page.documents[page.documents.length - 1].$id;
    }

    return events;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log("\n📊 Reputation Trajectory Distribution\n");

    const MS_PER_WEEK     = 7 * 24 * 60 * 60 * 1000;
    const QUERY_WINDOW_MS = 8 * MS_PER_WEEK;
    const windowStart     = new Date(Date.now() - QUERY_WINDOW_MS).toISOString();

    const activeUserIds = await fetchAllActiveUsersInWindow(windowStart);

    if (activeUserIds.length === 0) {
        console.log("No active users found in the last 8 weeks.");
        return;
    }

    console.log(`Found ${activeUserIds.length} users with recent reputation activity.\n`);

    const distribution = {
        Climbing: 0,
        Stable: 0,
        Declining: 0,
    };

    let processed = 0;
    for (const userId of activeUserIds) {
        // Fetch current reputation from user config (though it's not strictly needed for trajectory direction)
        // We will default to 0 for simplicity since Phase 4 trajectory is purely sum(delta) based.
        const events = await fetchUserEvents(userId, windowStart);
        const result = computeReputationTrajectory(events, 0);
        
        distribution[result.trajectory]++;
        processed++;
        
        if (processed % 10 === 0) {
            process.stdout.write(`  Processed ${processed}/${activeUserIds.length} users\r`);
        }
    }
    console.log(`  Processed ${processed}/${activeUserIds.length} users\n`);

    const total = activeUserIds.length;
    const pctClimbing  = Math.round((distribution.Climbing / total) * 100);
    const pctStable    = Math.round((distribution.Stable / total) * 100);
    const pctDeclining = Math.round((distribution.Declining / total) * 100);

    console.log(`── Distribution Results ──`);
    console.log(`Climbing:  ${distribution.Climbing.toString().padStart(4)} (${pctClimbing}%)`);
    console.log(`Stable:    ${distribution.Stable.toString().padStart(4)} (${pctStable}%)`);
    console.log(`Declining: ${distribution.Declining.toString().padStart(4)} (${pctDeclining}%)\n`);

    if (pctDeclining > 40) {
        console.warn(`⚠️  WARNING: Declining percentage exceeds 40% (${pctDeclining}%).`);
        console.warn(`   The reputation system may need rebalancing to prevent user discouragement.`);
    } else {
        console.log(`✅ Platform health signal is nominal. (Declining is ≤ 40%)`);
    }

    console.log("\n─────────────────────────────────────────");
    console.log("Observability audit complete.");
    console.log("─────────────────────────────────────────\n");
}

main().catch((err) => {
    console.error("\n❌ Job failed:", err?.message ?? err);
    process.exit(1);
});
