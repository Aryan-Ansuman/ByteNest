/**
 * Phase 6 — Step 6.1
 * Tag Expert Registry Builder.
 *
 * For every tag that has at least 5 questions on the platform:
 *  1. Reads all user_skill_scores documents for that tag.
 *  2. Sorts by compositeScore descending.
 *  3. Takes the top 20 users.
 *  4. Upserts them into tag_expert_registry (keyed on tag+userId).
 *  5. Removes stale registry entries (users who dropped out of the top 20).
 *
 * Called by:
 *  - The hourly scheduled job (Step 6.2).
 *  - The tier-change hook (Step 6.3) for immediate rebuilds after promotions.
 */

import { ID, Query } from "node-appwrite";
import { databases, users } from "@/models/server/config";
import {
    db,
    questionCollection,
    userSkillScoresCollection,
    tagExpertRegistryCollection,
} from "@/models/name";
import { UserPrefs } from "@/store/Auth";

// ─── Configuration ────────────────────────────────────────────────────────────

/** Number of experts stored per tag. */
const REGISTRY_TOP_N = 20;

/** Minimum questions a tag must have before we build a registry for it. */
const MIN_QUESTIONS_PER_TAG = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegistryBuildSummary {
    tagsProcessed: number;
    tagsSkipped: number;
    registryEntriesWritten: number;
    registryEntriesRemoved: number;
    failed: number;
    durationMs: number;
}

interface SkillScoreDoc {
    $id: string;
    userId: string;
    tag: string;
    compositeScore: number;
    tier: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

/** Paginate through all documents in a collection with given queries. */
async function listAll<T>(
    collectionId: string,
    queries: string[],
    cap = 5000
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

/**
 * Discover all tags that have at least MIN_QUESTIONS_PER_TAG questions.
 * Uses the questions collection as the source of truth.
 */
async function getEligibleTags(): Promise<string[]> {
    // Fetch distinct tags by scanning the questions collection.
    // We use a frequency map approach — no dedicated tags collection needed.
    const tagFreq = new Map<string, number>();
    let cursor: string | undefined;

    for (;;) {
        const page = await databases.listDocuments(db, questionCollection, [
            Query.select(["tags"]),
            Query.limit(100),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);

        for (const doc of page.documents) {
            for (const tag of (doc.tags as string[]) ?? []) {
                tagFreq.set(tag, (tagFreq.get(tag) ?? 0) + 1);
            }
        }

        if (page.documents.length < 100) break;
        cursor = page.documents[page.documents.length - 1].$id;
    }

    return Array.from(tagFreq.entries())
        .filter(([, count]) => count >= MIN_QUESTIONS_PER_TAG)
        .map(([tag]) => tag);
}

/**
 * Resolve a display name for a userId.
 * Falls back to "Unknown" if the account no longer exists.
 */
async function resolveUserName(userId: string): Promise<string> {
    try {
        const user = await users.get<UserPrefs>(userId);
        return user.name;
    } catch {
        return "Unknown";
    }
}

// ─── Per-tag rebuild ──────────────────────────────────────────────────────────

/**
 * Rebuild the expert registry for a single tag.
 *
 * @returns Object with counts of written and removed entries.
 */
export async function buildRegistryForTag(tag: string): Promise<{
    written: number;
    removed: number;
}> {
    const now = new Date().toISOString();

    // 1. Fetch all skill scores for this tag, sorted by score desc
    const scoreDocs = await listAll<SkillScoreDoc>(userSkillScoresCollection, [
        Query.equal("tag", tag),
        Query.orderDesc("compositeScore"),
        Query.select(["userId", "tag", "compositeScore", "tier"]),
    ]);

    // Take top N
    const topScores = scoreDocs.slice(0, REGISTRY_TOP_N);
    const topUserIds = new Set(topScores.map((s) => s.userId));

    // 2. Resolve user names in parallel (batched to avoid hammering the users API)
    const nameMap = new Map<string, string>();
    const BATCH_SIZE = 10;
    for (let i = 0; i < topScores.length; i += BATCH_SIZE) {
        const batch = topScores.slice(i, i + BATCH_SIZE);
        const resolved = await Promise.all(
            batch.map(async (s) => [s.userId, await resolveUserName(s.userId)] as const)
        );
        resolved.forEach(([uid, name]) => nameMap.set(uid, name));
    }

    // 3. Fetch current registry entries for this tag
    const existing = await listAll<any>(tagExpertRegistryCollection, [
        Query.equal("tag", tag),
        Query.select(["$id", "userId"]),
    ]);
    const existingByUserId = new Map(existing.map((e) => [e.userId as string, e.$id as string]));

    let written = 0;
    let removed = 0;

    // 4. Upsert top-N entries
    for (let rank = 0; rank < topScores.length; rank++) {
        const score = topScores[rank];
        const payload = {
            tag,
            userId: score.userId,
            userName: nameMap.get(score.userId) ?? "Unknown",
            compositeScore: score.compositeScore,
            tier: score.tier,
            rank: rank + 1,
            builtAt: now,
        };

        const existingId = existingByUserId.get(score.userId);
        if (existingId) {
            await databases.updateDocument(db, tagExpertRegistryCollection, existingId, payload);
        } else {
            await databases.createDocument(db, tagExpertRegistryCollection, ID.unique(), payload);
        }
        written++;
    }

    // 5. Remove stale entries (users no longer in top N)
    const staleEntries = existing.filter((e) => !topUserIds.has(e.userId as string));
    await Promise.allSettled(
        staleEntries.map((e) =>
            databases.deleteDocument(db, tagExpertRegistryCollection, e.$id as string)
        )
    );
    removed = staleEntries.length;

    return { written, removed };
}

// ─── Full registry rebuild ────────────────────────────────────────────────────

/**
 * Rebuild the tag expert registry for ALL eligible tags.
 * Called by the hourly scheduled job.
 *
 * @param options  Optional callbacks and delays for progress tracking.
 */
export async function buildFullRegistry(options: {
    onTagComplete?: (tag: string, written: number, removed: number) => void;
    onTagError?: (tag: string, error: unknown) => void;
    /** Milliseconds to wait between tags. Default 100. */
    interTagDelayMs?: number;
} = {}): Promise<RegistryBuildSummary> {
    const { onTagComplete, onTagError, interTagDelayMs = 100 } = options;
    const startedAt = Date.now();

    const eligibleTags = await getEligibleTags();
    let tagsProcessed = 0;
    let tagsSkipped = 0;
    let registryEntriesWritten = 0;
    let registryEntriesRemoved = 0;
    let failed = 0;

    for (let i = 0; i < eligibleTags.length; i++) {
        const tag = eligibleTags[i];

        try {
            const { written, removed } = await buildRegistryForTag(tag);
            registryEntriesWritten += written;
            registryEntriesRemoved += removed;
            tagsProcessed++;
            onTagComplete?.(tag, written, removed);
        } catch (err) {
            failed++;
            onTagError?.(tag, err);
        }

        if (interTagDelayMs > 0 && i < eligibleTags.length - 1) {
            await sleep(interTagDelayMs);
        }
    }

    return {
        tagsProcessed,
        tagsSkipped,
        registryEntriesWritten,
        registryEntriesRemoved,
        failed,
        durationMs: Date.now() - startedAt,
    };
}
