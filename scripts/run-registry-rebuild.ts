/**
 * Phase 6 — Registry Rebuild CLI Script
 *
 * Run with:
 *   npx tsx scripts/run-registry-rebuild.ts              # all eligible tags
 *   npx tsx scripts/run-registry-rebuild.ts <tag>        # single tag
 */

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

process.env.NEXT_PUBLIC_APPWRITE_HOST_URL = env.NEXT_PUBLIC_APPWRITE_HOST_URL;
process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID = env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
process.env.APPWRITE_API_KEY = env.APPWRITE_API_KEY;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    const { buildRegistryForTag } = await import("../src/lib/skills/registry-builder");
    const { runRegistryRebuildJob } = await import("../src/lib/skills/registry-rebuild-job");

    const targetTag = process.argv[2];

    if (targetTag) {
        // Single-tag mode
        console.log(`\n🔄  Rebuilding expert registry for tag: "${targetTag}"\n`);

        const { written, removed } = await buildRegistryForTag(targetTag);

        console.log(`\n✅  Done`);
        console.log(`   Entries written : ${written}`);
        console.log(`   Entries removed : ${removed}\n`);
        return;
    }

    // Full rebuild mode
    console.log("\n🔄  Rebuilding expert registry for ALL eligible tags\n");

    const summary = await runRegistryRebuildJob({ verbose: true });

    console.log("\n─────────────────────────────────────────");
    console.log(`✅  Registry rebuild complete`);
    console.log(`   Tags processed         : ${summary.tagsProcessed}`);
    console.log(`   Registry entries written: ${summary.registryEntriesWritten}`);
    console.log(`   Registry entries removed: ${summary.registryEntriesRemoved}`);
    console.log(`   Failed                 : ${summary.failed}`);
    console.log(`   Duration               : ${(summary.durationMs / 1000).toFixed(1)}s`);
    console.log("─────────────────────────────────────────\n");

    if (summary.failed > 0) {
        console.warn(`⚠️  ${summary.failed} tag(s) failed — check logs above.`);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("\n❌  Registry rebuild failed:", err?.message ?? err);
    process.exit(1);
});
