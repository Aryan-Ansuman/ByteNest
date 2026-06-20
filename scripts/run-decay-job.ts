/**
 * Phase 2 — Temporal Decay Job CLI Script
 *
 * Run with:  npx tsx scripts/run-decay-job.ts
 *
 * Finds all user_skill_scores documents that haven't been updated in
 * the configured threshold (default 24 hours) and recalculates them
 * so inactive users' scores naturally decay over time.
 */

import { runTemporalDecayJob } from "../src/lib/skills/temporal-decay-job";

async function main() {
    console.log("\n🕐  Temporal Decay Job — Starting\n");

    const thresholdHoursArg = process.argv[2];
    const staleThresholdHours = thresholdHoursArg
        ? Number(thresholdHoursArg)
        : 24;

    if (Number.isNaN(staleThresholdHours) || staleThresholdHours <= 0) {
        console.error("Usage: npx tsx scripts/run-decay-job.ts [staleThresholdHours]");
        process.exit(1);
    }

    console.log(`Stale threshold: ${staleThresholdHours} hour(s)`);
    console.log("Press Ctrl+C to cancel.\n");

    const summary = await runTemporalDecayJob({
        staleThresholdHours,
        onProgress: (done, total) => {
            if (done % 25 === 0 || done === total) {
                const pct = Math.round((done / total) * 100);
                process.stdout.write(`\r  Progress: ${done}/${total} (${pct}%)  `);
            }
        },
    });

    process.stdout.write("\n");

    console.log("\n─────────────────────────────────────────");
    console.log(`✅  Decay job complete`);
    console.log(`   Stale docs found : ${summary.staleDocsFound}`);
    console.log(`   Recalculated     : ${summary.recalculated}`);
    console.log(`   Failed           : ${summary.failed}`);
    console.log(`   Duration         : ${(summary.durationMs / 1000).toFixed(1)}s`);
    console.log("─────────────────────────────────────────\n");

    if (summary.failed > 0) {
        console.warn(`⚠️  ${summary.failed} recalculation(s) failed — check logs above.`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("\n❌  Decay job crashed:", err?.message ?? err);
    process.exit(1);
});
