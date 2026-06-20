/**
 * Phase 2 — Step 2.5
 * Temporal decay job.
 *
 * Runs on a schedule (e.g. once per day via Appwrite Functions or a cron job).
 * Finds all user_skill_scores documents whose lastCalculatedAt is older than
 * the configured staleness threshold and forces a full recalculation for
 * each affected userId+tag pair.
 *
 * Why recalculate rather than just reducing the stored number?
 *   computeTemporalConsistencyScore already models inactivity decay based on
 *   the real activity dates, so simply re-running the full calculation with
 *   the current date will produce a naturally lower temporalConsistencyScore
 *   for users who haven't contributed recently. No magic number adjustments
 *   needed.
 *
 * Run manually with:  npx tsx scripts/run-decay-job.ts
 */

import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, userSkillScoresCollection } from "@/models/name";
import { recalculateUserTagScore } from "./per-tag-calculator";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Documents older than this (in hours) are considered stale and will be refreshed. */
const STALE_THRESHOLD_HOURS = 24;

/** Maximum number of stale documents processed in one decay run. */
const MAX_DOCS_PER_RUN = 500;

/** Milliseconds to wait between individual recalculations to avoid Appwrite throttling. */
const INTER_DOC_DELAY_MS = 50;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DecayRunSummary {
    staleDocsFound: number;
    recalculated:   number;
    failed:         number;
    durationMs:     number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function staleThresholdISO(thresholdHours = STALE_THRESHOLD_HOURS): string {
    return new Date(Date.now() - thresholdHours * 60 * 60 * 1000).toISOString();
}

// ─── Decay job ────────────────────────────────────────────────────────────────

/**
 * Process stale skill score documents and reapply temporal decay.
 *
 * @param options   Optional overrides for threshold and batch size.
 * @returns Summary of the decay run.
 */
export async function runTemporalDecayJob(options: {
    staleThresholdHours?: number;
    maxDocsPerRun?:       number;
    onProgress?:          (processed: number, total: number) => void;
} = {}): Promise<DecayRunSummary> {
    const {
        staleThresholdHours = STALE_THRESHOLD_HOURS,
        maxDocsPerRun       = MAX_DOCS_PER_RUN,
        onProgress,
    } = options;

    const startedAt  = Date.now();
    const cutoff     = staleThresholdISO(staleThresholdHours);

    // ── 1. Fetch stale documents ───────────────────────────────────────────────
    //
    // Appwrite doesn't support "less than datetime" natively via the Query API
    // in all SDK versions, so we fall back to string comparison (ISO 8601 is
    // lexicographically sortable).
    const staleDocs: Array<{ userId: string; tag: string }> = [];
    let cursor: string | undefined;

    outer: for (;;) {
        const page = await databases.listDocuments(db, userSkillScoresCollection, [
            Query.lessThan("lastCalculatedAt", cutoff),
            Query.orderAsc("lastCalculatedAt"),
            Query.limit(100),
            Query.select(["userId", "tag", "lastCalculatedAt"]),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);

        for (const doc of page.documents) {
            staleDocs.push({ userId: doc.userId as string, tag: doc.tag as string });
            if (staleDocs.length >= maxDocsPerRun) break outer;
        }

        if (page.documents.length < 100) break;
        cursor = page.documents[page.documents.length - 1].$id;
    }

    const staleDocsFound = staleDocs.length;
    let recalculated = 0;
    let failed       = 0;

    // ── 2. Recalculate each stale userId+tag pair ─────────────────────────────
    for (let i = 0; i < staleDocs.length; i++) {
        const { userId, tag } = staleDocs[i];

        try {
            await recalculateUserTagScore(userId, tag, "decay_run");
            recalculated++;
        } catch (err: any) {
            failed++;
            console.error(
                `[decay] Failed to recalculate userId=${userId} tag=${tag}: ${err?.message}`
            );
        }

        onProgress?.(i + 1, staleDocsFound);

        if (INTER_DOC_DELAY_MS > 0 && i < staleDocs.length - 1) {
            await sleep(INTER_DOC_DELAY_MS);
        }
    }

    return {
        staleDocsFound,
        recalculated,
        failed,
        durationMs: Date.now() - startedAt,
    };
}

// ─── Entry point for Appwrite Function / CLI ──────────────────────────────────

/**
 * Appwrite Function handler — wire this to a scheduled trigger.
 *
 * Example appwrite.json event:
 *   "schedule": "0 3 * * *"   (runs every day at 03:00 UTC)
 */
export async function decayJobHandler({
    log,
    error,
}: {
    log: (msg: string) => void;
    error: (msg: string) => void;
}) {
    log("[decay] Starting temporal decay job…");

    try {
        const summary = await runTemporalDecayJob({
            onProgress: (done, total) => {
                if (done % 50 === 0 || done === total) {
                    log(`[decay] Progress: ${done}/${total}`);
                }
            },
        });

        log(
            `[decay] Done — stale: ${summary.staleDocsFound}, ` +
            `recalculated: ${summary.recalculated}, ` +
            `failed: ${summary.failed}, ` +
            `duration: ${summary.durationMs}ms`
        );
    } catch (err: any) {
        error(`[decay] Job failed: ${err?.message}`);
        throw err;
    }
}
