/**
 * GET /api/answer-gaps
 *
 * Returns up to 3 unanswered questions matched to the authenticated user's
 * top skill tags, sorted by gap urgency score.
 *
 * Phase 4 adds parallel author enrichment via the existing getAuthorsById
 * utility — no sequential fetches, no new author logic.
 *
 * Authentication: JWT required. userId is read from the verified session,
 * never from a query parameter.
 *
 * Caching: 10-minute per-user cache using the rateLimits collection.
 * Rate limit: 20 requests per user per minute.
 *
 * Phase 7 — Edge Cases and Hardening
 *   Step 7.1 — no_skill_data response when the user has zero skill score docs
 *   Step 7.2 — no_gaps response when skill data exists but no candidate
 *              questions survive the tag query (covers low-volume tags too)
 *   Step 7.3 — Query.notEqual("authorId", userId) excludes the user's own questions
 *   Step 7.4 — No real-time invalidation between cache fill and display (by design)
 *   Step 7.5 — Rate limited to GAP_RATE_LIMIT requests per GAP_RATE_WINDOW_MS
 *
 * Phase 8 — Observability
 *   Step 8.1 — logCacheOutcome() logs every HIT/MISS and warns on low hit rate
 *   Step 8.2 — click-through tracking lives in the frontend (AnswerGapDetector's
 *              GapRow appends ?ref=gap-detector to each question link) — no
 *              server-side change needed here
 */

import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, questionCollection, userSkillScoresCollection } from "@/models/name";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getAuthorsById, deletedAuthor } from "@/lib/authors";
import { readGapCache, writeGapCache } from "@/lib/answer-gaps/cache";
import { logCacheOutcome } from "@/lib/answer-gaps/observability";
import {
    GAP_TOP_TAGS_LIMIT,
    GAP_PER_TAG_FETCH_LIMIT,
    GAP_RESULT_LIMIT,
    GAP_RATE_LIMIT,
    GAP_RATE_WINDOW_MS,
    gapTimeWindow,
} from "@/lib/answer-gaps/constants";

export const dynamic = "force-dynamic";

// ─── Response shape ───────────────────────────────────────────────────────────

export interface GapQuestion {
    $id: string;
    title: string;
    tags: string[];
    $createdAt: string;
    authorId: string;
    authorName: string;
    authorReputation: number;
    hoursWaiting: number;       // integer — frontend does zero date math
    matchedTag: string;         // which skill tag triggered this match
    userTierInMatchedTag: string; // e.g. "Expert"
    userScoreInMatchedTag: number;
    urgencyScore: number;       // higher = more urgent
}

// ─── Urgency score ────────────────────────────────────────────────────────────
//
// urgency = hoursWaiting × tagWeight × inverseReputationFactor
//
// tagWeight: derived from the user's composite score in the matched tag
//   — higher score means the user can add more value here
//
// inverseReputationFactor: gently surfaces questions from lower-rep askers
//   — minor signal, capped so it doesn't dominate

function computeUrgencyScore(
    hoursWaiting: number,
    userScoreInTag: number,
    authorReputation: number
): number {
    const tagWeight = userScoreInTag / 100; // 0–1
    const inverseRepFactor = Math.max(0.5, 1 - Math.log10(Math.max(1, authorReputation)) / 4);
    return hoursWaiting * tagWeight * inverseRepFactor;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    // ── 1. Authenticate ───────────────────────────────────────────────────────
    let userId: string;
    try {
        userId = await getAuthenticatedUserId();
    } catch {
        return unauthorizedResponse("Authentication required");
    }

    // ── 2. Rate limit — Step 7.5: 20 requests/user/minute ─────────────────────
    const rl = await rateLimit({
        key: `answer-gaps:${userId}`,
        limit: GAP_RATE_LIMIT,
        windowMs: GAP_RATE_WINDOW_MS,
    });
    const rlHeaders = rateLimitHeaders(rl, GAP_RATE_LIMIT);

    if (!rl.success) {
        return NextResponse.json(
            { error: "Too many requests. Please slow down." },
            { status: 429, headers: rlHeaders }
        );
    }

    try {
        // ── 3. Cache check ─────────────────────────────────────────────────────────
        // Step 7.4 — Deliberately no real-time invalidation here. A question
        // may receive an answer in the gap between cache fill and display;
        // the returned link still resolves correctly, it just may show a
        // question that has since been answered. Acceptable for v1.
        const cache = await readGapCache(userId);
        if (cache.hit) {
            rlHeaders["X-Gap-Cache"] = "HIT";
            // Step 8.1 — cache hit/miss logging
            logCacheOutcome(userId, "HIT");
            return NextResponse.json(
                { data: cache.payload.data, meta: cache.payload.meta },
                { status: 200, headers: { ...rlHeaders, "Cache-Control": "no-store" } }
            );
        }
        rlHeaders["X-Gap-Cache"] = "MISS";
        // Step 8.1 — cache hit/miss logging
        logCacheOutcome(userId, "MISS");

        // ── 4. Fetch user's top skill tags ─────────────────────────────────────────
        const skillScores = await databases.listDocuments(
            db,
            userSkillScoresCollection,
            [
                Query.equal("userId", userId),
                Query.orderDesc("compositeScore"),
                Query.limit(GAP_TOP_TAGS_LIMIT),
                Query.select(["tag", "compositeScore", "tier"]),
            ]
        );

        // Step 7.1 — User has no user_skill_scores documents at all.
        // Return a distinct reason so the frontend shows "build your skill
        // profile first" instead of treating this the same as "no gaps right now".
        if (skillScores.documents.length === 0) {
            const emptyResult = { data: [], meta: { reason: "no_skill_data" as const, count: 0 } };
            await writeGapCache(userId, emptyResult).catch(() => undefined);
            return NextResponse.json(
                emptyResult,
                { status: 200, headers: { ...rlHeaders, "Cache-Control": "no-store" } }
            );
        }

        const topTags = skillScores.documents.map((doc) => ({
            tag: doc.tag as string,
            compositeScore: doc.compositeScore as number,
            tier: doc.tier as string,
        }));

        // ── 5. Compute time window ─────────────────────────────────────────────────
        const { earliest, latest } = gapTimeWindow();
        const now = Date.now();

        // ── 6. Fetch unanswered questions per tag (parallel) ───────────────────────
        // Step 7.3 — Query.notEqual("authorId", userId) excludes the user's own
        // questions so they're never prompted to answer themselves.
        const tagQueryPromises = topTags.map(({ tag }) =>
            databases.listDocuments(db, questionCollection, [
                Query.contains("tags", [tag]),
                Query.equal("totalAnswers", 0),
                Query.greaterThan("$createdAt", earliest),
                Query.lessThan("$createdAt", latest),
                Query.notEqual("authorId", userId),
                Query.orderAsc("$createdAt"),
                Query.limit(GAP_PER_TAG_FETCH_LIMIT),
                Query.select(["$id", "$createdAt", "title", "tags", "authorId"]),
            ]).catch(() => ({ documents: [] as any[] }))
        );

        const tagResults = await Promise.all(tagQueryPromises);

        // ── 7. Merge, deduplicate, and annotate ────────────────────────────────────
        const seen = new Set<string>();
        const candidates: Array<{
            doc: any;
            matchedTag: string;
            userScoreInTag: number;
            userTierInTag: string;
            hoursWaiting: number;
        }> = [];

        for (let i = 0; i < topTags.length; i++) {
            const { tag, compositeScore, tier } = topTags[i];
            for (const doc of tagResults[i].documents) {
                if (seen.has(doc.$id)) continue;
                seen.add(doc.$id);

                const createdMs = new Date(doc.$createdAt).getTime();
                const hoursWaiting = Math.floor((now - createdMs) / (60 * 60 * 1000));

                candidates.push({
                    doc,
                    matchedTag: tag,
                    userScoreInTag: compositeScore,
                    userTierInTag: tier,
                    hoursWaiting,
                });
            }
        }

        // Step 7.2 — Skill scores exist, but no candidates survived the tag
        // query. This naturally covers the "all tags are too new / too low
        // volume" case — there's simply nothing in the time window to surface.
        if (candidates.length === 0) {
            const emptyResult = { data: [], meta: { reason: "no_gaps" as const, count: 0 } };
            await writeGapCache(userId, emptyResult).catch(() => undefined);
            return NextResponse.json(
                emptyResult,
                { status: 200, headers: { ...rlHeaders, "Cache-Control": "no-store" } }
            );
        }

        // ── 8. Sort by urgency and take top RESULTS_LIMIT ─────────────────────────
        candidates.sort((a, b) => {
            const urgencyA = computeUrgencyScore(a.hoursWaiting, a.userScoreInTag, 1);
            const urgencyB = computeUrgencyScore(b.hoursWaiting, b.userScoreInTag, 1);
            return urgencyB - urgencyA;
        });

        const top = candidates.slice(0, GAP_RESULT_LIMIT);

        // ── 9. Phase 4 — Parallel author enrichment ───────────────────────────────
        const authorIds = top.map((c) => c.doc.authorId as string);
        const authorById = await getAuthorsById(authorIds);

        // ── 10. Build final response ───────────────────────────────────────────────
        const gaps: GapQuestion[] = top.map(
            ({ doc, matchedTag, userScoreInTag, userTierInTag, hoursWaiting }) => {
                const author = authorById.get(doc.authorId as string) ?? deletedAuthor;
                const urgencyScore = computeUrgencyScore(
                    hoursWaiting,
                    userScoreInTag,
                    author.reputation
                );

                return {
                    $id: doc.$id,
                    title: doc.title as string,
                    tags: (doc.tags as string[]) ?? [],
                    $createdAt: doc.$createdAt,
                    authorId: doc.authorId as string,
                    authorName: author.name,
                    authorReputation: author.reputation,
                    hoursWaiting,
                    matchedTag,
                    userTierInMatchedTag: userTierInTag,
                    userScoreInMatchedTag: userScoreInTag,
                    urgencyScore: Math.round(urgencyScore * 100) / 100,
                };
            }
        );

        // Re-sort with accurate author reputation now available
        gaps.sort((a, b) => b.urgencyScore - a.urgencyScore);

        const result = { data: gaps, meta: { reason: "ok" as const, count: gaps.length } };
        await writeGapCache(userId, result).catch(() => undefined);

        return NextResponse.json(
            result,
            {
                status: 200,
                headers: { ...rlHeaders, "Cache-Control": "no-store" },
            }
        );
    } catch (error: any) {
        console.error("[/api/answer-gaps]", error?.message ?? error);
        return NextResponse.json(
            { error: error?.message ?? "Failed to load answer gaps" },
            { status: error?.status ?? error?.code ?? 500, headers: rlHeaders }
        );
    }
}
