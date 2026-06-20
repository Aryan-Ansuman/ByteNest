/**
 * Phase 6 — Step 6.2
 * Scheduled registry rebuild job.
 *
 * Appwrite Function handler wired to a schedule trigger (e.g. "0 * * * *" — every hour).
 * Also exported as a standalone async function for CLI use.
 *
 * appwrite.json wiring (add to the "functions" array):
 * {
 *   "$id": "rebuild-tag-expert-registry",
 *   "name": "Rebuild Tag Expert Registry",
 *   "runtime": "node-18.0",
 *   "execute": ["any"],
 *   "events": [],
 *   "schedule": "0 * * * *",
 *   "timeout": 300,
 *   "entrypoint": "src/main.js",
 *   "commands": "npm install",
 *   "path": "functions/rebuild-tag-expert-registry"
 * }
 *
 * Run manually:  npx tsx scripts/run-registry-rebuild.ts
 */

import { buildFullRegistry, type RegistryBuildSummary } from "./registry-builder";

// ─── Scheduled job entry point ─────────────────────────────────────────────

/**
 * Appwrite Function handler.
 * Wire to the "rebuild-tag-expert-registry" function's schedule trigger.
 */
export async function registryRebuildJobHandler({
    log,
    error,
}: {
    log: (msg: string) => void;
    error: (msg: string) => void;
}) {
    log("[registry-rebuild] Starting hourly tag expert registry rebuild…");

    try {
        const summary = await buildFullRegistry({
            interTagDelayMs: 100,
            onTagComplete: (tag, written, removed) => {
                log(`[registry-rebuild] ${tag}: ${written} written, ${removed} removed`);
            },
            onTagError: (tag, err: any) => {
                error(`[registry-rebuild] Failed for tag=${tag}: ${err?.message}`);
            },
        });

        log(
            `[registry-rebuild] Done — ` +
            `tags: ${summary.tagsProcessed}, ` +
            `entries written: ${summary.registryEntriesWritten}, ` +
            `entries removed: ${summary.registryEntriesRemoved}, ` +
            `failed: ${summary.failed}, ` +
            `duration: ${summary.durationMs}ms`
        );
    } catch (err: any) {
        error(`[registry-rebuild] Job crashed: ${err?.message}`);
        throw err;
    }
}

// ─── Standalone async runner (for npx tsx / direct import) ─────────────────

/**
 * Run a full registry rebuild programmatically.
 * Useful for backfill scripts or integration tests.
 */
export async function runRegistryRebuildJob(options: {
    verbose?: boolean;
    interTagDelayMs?: number;
} = {}): Promise<RegistryBuildSummary> {
    const { verbose = false, interTagDelayMs = 100 } = options;

    return buildFullRegistry({
        interTagDelayMs,
        onTagComplete: verbose
            ? (tag, written, removed) =>
                  console.log(`  ✓ ${tag.padEnd(25)} +${written} written  -${removed} removed`)
            : undefined,
        onTagError: (tag, err: any) =>
            console.error(`  ✗ ${tag}: ${err?.message}`),
    });
}
