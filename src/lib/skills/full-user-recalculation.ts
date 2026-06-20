/**
 * Phase 2 — Step 2.4
 * Full user recalculation job.
 *
 * Iterates over all tags a user has activity in and calls
 * recalculateUserTagScore for each one.
 *
 * Used by:
 *  - Initial backfill (Phase 1.5 seeded the documents; this fills the scores)
 *  - Periodic full recalculations (scheduled via Appwrite Functions)
 *  - Manual runs via the CLI during development
 *
 * Run with:  npx tsx scripts/run-full-recalculation.ts <userId?>
 */

import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import {
    db,
    questionCollection,
    answerCollection,
} from "@/models/name";
import { recalculateUserTagScore, type RecalcResult } from "./per-tag-calculator";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function listAll<T>(
    collectionId: string,
    queries: string[],
    cap = 2000
): Promise<T[]> {
    const results: T[] = [];
    let cursor: string | undefined;

    for (;;) {
        const page = await databases.listDocuments(db, collectionId, [
            ...queries,
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);

        results.push(...(page.documents as T[]));

        if (page.documents.length < 100 || results.length >= cap) break;
        cursor = page.documents[page.documents.length - 1].$id;
    }

    return results;
}

// ─── Per-user recalculation ───────────────────────────────────────────────────

/**
 * Recalculate all skill scores for a single user.
 *
 * @param userId         Appwrite user ID.
 * @param triggerType    Reason code written into the audit log.
 * @returns Array of RecalcResult — one per tag where the user has activity.
 */
export async function recalculateAllTagsForUser(
    userId: string,
    triggerType:
        | "vote_cast"
        | "answer_posted"
        | "answer_accepted"
        | "question_posted"
        | "decay_run"
        | "backfill" = "backfill"
): Promise<RecalcResult[]> {
    // Collect every tag this user has contributed to
    const [questions, answers] = await Promise.all([
        listAll<any>(questionCollection, [
            Query.equal("authorId", userId),
            Query.select(["tags"]),
        ]),
        listAll<any>(answerCollection, [
            Query.equal("authorId", userId),
            Query.select(["questionId"]),
        ]),
    ]);

    // Tags from the user's own questions
    const tagSet = new Set<string>();
    for (const q of questions) {
        for (const t of (q.tags as string[]) ?? []) {
            tagSet.add(t);
        }
    }

    // Tags from questions the user answered (need a second lookup)
    if (answers.length > 0) {
        const questionIds = Array.from(
            new Set(answers.map((a: any) => a.questionId as string))
        );

        for (let i = 0; i < questionIds.length; i += 100) {
            const chunk = questionIds.slice(i, i + 100);
            const taggedQuestions = await databases.listDocuments(db, questionCollection, [
                Query.equal("$id", chunk),
                Query.select(["tags"]),
                Query.limit(100),
            ]);
            for (const q of taggedQuestions.documents) {
                for (const t of (q.tags as string[]) ?? []) {
                    tagSet.add(t);
                }
            }
        }
    }

    const tags = Array.from(tagSet);
    if (tags.length === 0) return [];

    const results: RecalcResult[] = [];

    // Process tags sequentially to avoid hammering Appwrite under burst loads.
    // For large users a small delay between tags helps stay within rate limits.
    for (const tag of tags) {
        try {
            const result = await recalculateUserTagScore(userId, tag, triggerType);
            results.push(result);
        } catch (err: any) {
            console.error(
                `[recalcAllTags] Failed for userId=${userId} tag=${tag}: ${err?.message}`
            );
        }
    }

    return results;
}

// ─── Batch / platform-wide recalculation ─────────────────────────────────────

export interface BatchRecalcOptions {
    /** Batch size — number of users processed before each delay. Default: 50. */
    batchSize?: number;
    /** Milliseconds to wait between batches. Default: 300. */
    delayMs?: number;
    /** Called after each user is processed. Useful for progress logging. */
    onUserComplete?: (userId: string, results: RecalcResult[]) => void;
    /** Called when a user fails. */
    onUserError?: (userId: string, error: unknown) => void;
}

/**
 * Recalculate skill scores for a list of user IDs, processing them
 * in batches with a configurable delay to avoid overwhelming Appwrite.
 *
 * Typically called from the backfill script or a scheduled Appwrite Function.
 *
 * @param userIds   List of user IDs to process.
 * @param options   Batching configuration.
 */
export async function batchRecalculateUsers(
    userIds: string[],
    options: BatchRecalcOptions = {}
): Promise<{ processed: number; failed: number }> {
    const {
        batchSize = 50,
        delayMs   = 300,
        onUserComplete,
        onUserError,
    } = options;

    let processed = 0;
    let failed    = 0;

    for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);

        await Promise.all(
            batch.map(async (userId) => {
                try {
                    const results = await recalculateAllTagsForUser(userId, "backfill");
                    processed++;
                    onUserComplete?.(userId, results);
                } catch (err) {
                    failed++;
                    onUserError?.(userId, err);
                }
            })
        );

        // Delay between batches (skip after the last one)
        if (i + batchSize < userIds.length && delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }

    return { processed, failed };
}
