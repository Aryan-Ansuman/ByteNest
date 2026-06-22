/**
 * Reputation Trajectory — Phase 1 standalone setup script.
 * Use this if the database already exists (dbSetup.ts only runs the
 * collection creators on first-time database creation).
 *
 * Run with: npx tsx scripts/setup-reputation-events-collection.ts
 */

import createReputationEventsCollection from "../src/models/server/reputation-events.collection";

async function main() {
    console.log("\n🚀  Reputation Trajectory — Phase 1: reputation_events collection\n");
    await createReputationEventsCollection();
    console.log("\n🎉  Phase 1 complete — reputation_events collection and indexes created\n");
}

main().catch((err) => {
    console.error("❌  Setup failed:", err?.message ?? err);
    process.exit(1);
});
