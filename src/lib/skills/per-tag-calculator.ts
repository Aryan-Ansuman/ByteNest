/**
 * Phase 2 — Step 2.3
 * Per-user-per-tag calculator.
 *
 * Fetches all relevant Appwrite documents for a given userId + tag,
 * calls the four scoring functions, calls the aggregator, and writes
 * (or updates) the result in user_skill_scores.
 *
 * This is the workhorse — every other recalculation path calls this.
 */

import { ID, Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import {
    db,
    questionCollection,
    answerCollection,
    voteCollection,
    userSkillScoresCollection,
    skillCalcEventsCollection,
} from "@/models/name";
import {
    computeAnswerQualityScore,
    computeQuestionQualityScore,
    computeTemporalConsistencyScore,
    computePeerValidationScore,
    type AnswerActivity,
    type QuestionActivity,
    type PeerVoter,
} from "./scoring-functions";
import { aggregateScore, crossedTierBoundary, type SkillTier } from "./composite-aggregator";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RecalcResult {
    userId:         string;
    tag:            string;
    compositeScore: number;
    tier:           SkillTier;
    previousScore:  number;
    tierChanged:    boolean;
    documentId:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Paginate through all documents (up to hard cap) to avoid the 100-doc limit. */
async function listAll<T>(
    collectionId: string,
    queries: string[],
    cap = 500
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

/** Return the existing user_skill_scores document for userId+tag, or null. */
async function getExistingScoreDoc(userId: string, tag: string) {
    const res = await databases.listDocuments(db, userSkillScoresCollection, [
        Query.equal("userId", userId),
        Query.equal("tag", tag),
        Query.limit(1),
    ]);
    return res.documents[0] ?? null;
}

// ─── Main calculator ──────────────────────────────────────────────────────────

/**
 * Recalculate skill score for one user in one tag and persist the result.
 *
 * @param userId   Appwrite user ID.
 * @param tag      The technology tag (e.g. "react").
 * @param triggerType  What caused this recalculation — recorded in the audit log.
 * @returns RecalcResult with before/after scores and tier-change flag.
 */
export async function recalculateUserTagScore(
    userId: string,
    tag: string,
    triggerType:
        | "vote_cast"
        | "answer_posted"
        | "answer_accepted"
        | "question_posted"
        | "decay_run"
        | "backfill" = "backfill"
): Promise<RecalcResult> {
    const now = new Date().toISOString();

    // ── 1. Questions by this user with this tag ────────────────────────────────
    const userQuestions = await listAll<any>(questionCollection, [
        Query.equal("authorId", userId),
        Query.contains("tags", [tag]),
        Query.select(["$id", "$createdAt", "totalVotes", "totalAnswers"]),
    ]);

    const questionIds = userQuestions.map((q: any) => q.$id);

    // ── 2. Answers by this user on questions with this tag ────────────────────
    // We need to find all answers by this user, then cross-reference with
    // questions that have the target tag. We fetch answers by authorId and
    // filter down to those belonging to tagged questions.
    const allUserAnswers = await listAll<any>(answerCollection, [
        Query.equal("authorId", userId),
        Query.select(["$id", "$createdAt", "questionId", "isAccepted", "totalVotes"]),
    ]);

    // Build a set of all question IDs that contain this tag (from the user's
    // questions above PLUS any other question they answered).
    const taggedQuestionIds = new Set<string>(questionIds);

    // For answers whose questionId we don't already know is tagged, check in
    // batches.
    const unknownQuestionIds = Array.from(
        new Set(
            allUserAnswers
                .map((a: any) => a.questionId as string)
                .filter((qId) => !taggedQuestionIds.has(qId))
        )
    );

    if (unknownQuestionIds.length > 0) {
        // Batch in chunks of 100 (Appwrite Query.equal array limit)
        for (let i = 0; i < unknownQuestionIds.length; i += 100) {
            const chunk = unknownQuestionIds.slice(i, i + 100);
            const taggedInChunk = await databases.listDocuments(db, questionCollection, [
                Query.equal("$id", chunk),
                Query.contains("tags", [tag]),
                Query.select(["$id"]),
                Query.limit(100),
            ]);
            taggedInChunk.documents.forEach((doc) => taggedQuestionIds.add(doc.$id));
        }
    }

    const taggedAnswers = allUserAnswers.filter((a: any) =>
        taggedQuestionIds.has(a.questionId as string)
    );

    // ── 3. Build vote data for answers ────────────────────────────────────────
    const answerIds = taggedAnswers.map((a: any) => a.$id as string);

    // Fetch upvotes on these answers in batches
    const answerUpvotes = new Map<string, number>();
    const answerDownvotes = new Map<string, number>();

    for (let i = 0; i < answerIds.length; i += 100) {
        const chunk = answerIds.slice(i, i + 100);
        if (chunk.length === 0) continue;

        const [ups, downs] = await Promise.all([
            databases.listDocuments(db, voteCollection, [
                Query.equal("type", "answer"),
                Query.equal("typeId", chunk),
                Query.equal("voteStatus", "upvoted"),
                Query.limit(100),
            ]),
            databases.listDocuments(db, voteCollection, [
                Query.equal("type", "answer"),
                Query.equal("typeId", chunk),
                Query.equal("voteStatus", "downvoted"),
                Query.limit(100),
            ]),
        ]);

        ups.documents.forEach((v) => {
            answerUpvotes.set(v.typeId as string, (answerUpvotes.get(v.typeId as string) ?? 0) + 1);
        });
        downs.documents.forEach((v) => {
            answerDownvotes.set(v.typeId as string, (answerDownvotes.get(v.typeId as string) ?? 0) + 1);
        });
    }

    // ── 4. Build vote data for questions ─────────────────────────────────────
    const questionUpvotes = new Map<string, number>();
    const questionDownvotes = new Map<string, number>();

    for (let i = 0; i < questionIds.length; i += 100) {
        const chunk = questionIds.slice(i, i + 100);
        if (chunk.length === 0) continue;

        const [ups, downs] = await Promise.all([
            databases.listDocuments(db, voteCollection, [
                Query.equal("type", "question"),
                Query.equal("typeId", chunk),
                Query.equal("voteStatus", "upvoted"),
                Query.limit(100),
            ]),
            databases.listDocuments(db, voteCollection, [
                Query.equal("type", "question"),
                Query.equal("typeId", chunk),
                Query.equal("voteStatus", "downvoted"),
                Query.limit(100),
            ]),
        ]);

        ups.documents.forEach((v) => {
            questionUpvotes.set(v.typeId as string, (questionUpvotes.get(v.typeId as string) ?? 0) + 1);
        });
        downs.documents.forEach((v) => {
            questionDownvotes.set(v.typeId as string, (questionDownvotes.get(v.typeId as string) ?? 0) + 1);
        });
    }

    // ── 5. Build peer voters (upvoters of this user's answers in this tag) ───
    const peerVoterIds: string[] = [];
    for (let i = 0; i < answerIds.length; i += 100) {
        const chunk = answerIds.slice(i, i + 100);
        if (chunk.length === 0) continue;
        const upvoteDocs = await databases.listDocuments(db, voteCollection, [
            Query.equal("type", "answer"),
            Query.equal("typeId", chunk),
            Query.equal("voteStatus", "upvoted"),
            Query.limit(100),
        ]);
        upvoteDocs.documents.forEach((v) => {
            if (v.votedById && v.votedById !== userId) {
                peerVoterIds.push(v.votedById as string);
            }
        });
    }

    // Fetch composite scores for peer voters from user_skill_scores
    const uniquePeerIds = Array.from(new Set(peerVoterIds));
    const peers: PeerVoter[] = [];

    for (let i = 0; i < uniquePeerIds.length; i += 100) {
        const chunk = uniquePeerIds.slice(i, i + 100);
        const peerScoreDocs = await databases.listDocuments(db, userSkillScoresCollection, [
            Query.equal("userId", chunk),
            Query.equal("tag", tag),
            Query.limit(100),
        ]);
        peerScoreDocs.documents.forEach((doc) => {
            peers.push({
                voterId: doc.userId as string,
                voterCompositeScore: Number(doc.compositeScore ?? 0),
            });
        });

        // Peers without a score doc are treated as Newcomers (score = 0)
        const scoredIds = new Set(peerScoreDocs.documents.map((d) => d.userId as string));
        chunk.forEach((peerId) => {
            if (!scoredIds.has(peerId)) {
                peers.push({ voterId: peerId, voterCompositeScore: 0 });
            }
        });
    }

    // ── 6. Build structured activity arrays for the scoring functions ─────────
    const answerActivity: AnswerActivity[] = taggedAnswers.map((a: any) => ({
        answerId:   a.$id,
        questionId: a.questionId,
        isAccepted: Boolean(a.isAccepted),
        upvotes:    answerUpvotes.get(a.$id) ?? Number(a.totalVotes ?? 0),
        downvotes:  answerDownvotes.get(a.$id) ?? 0,
        createdAt:  a.$createdAt,
    }));

    const questionActivity: QuestionActivity[] = userQuestions.map((q: any) => ({
        questionId:   q.$id,
        upvotes:      questionUpvotes.get(q.$id) ?? 0,
        downvotes:    questionDownvotes.get(q.$id) ?? 0,
        totalAnswers: Number(q.totalAnswers ?? 0),
        createdAt:    q.$createdAt,
    }));

    const allActivityDates = [
        ...taggedAnswers.map((a: any) => a.$createdAt as string),
        ...userQuestions.map((q: any) => q.$createdAt as string),
    ];

    // ── 7. Compute sub-scores ─────────────────────────────────────────────────
    const answerQualityScore       = computeAnswerQualityScore(answerActivity);
    const questionQualityScore     = computeQuestionQualityScore(questionActivity);
    const temporalConsistencyScore = computeTemporalConsistencyScore(allActivityDates);
    const peerValidationScore      = computePeerValidationScore(peers);

    // ── 8. Load existing score (for trend + 7-day history) ───────────────────
    const existingDoc = await getExistingScoreDoc(userId, tag);
    const previousScore = existingDoc ? Number(existingDoc.compositeScore ?? 0) : 0;

    // Rotate scoreSevenDaysAgo if it hasn't been updated in 7 days
    let scoreSevenDaysAgo = existingDoc ? Number(existingDoc.scoreSevenDaysAgo ?? 0) : 0;
    if (existingDoc?.lastCalculatedAt) {
        const lastCalc = new Date(existingDoc.lastCalculatedAt as string).getTime();
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - lastCalc >= sevenDaysMs) {
            scoreSevenDaysAgo = previousScore;
        }
    }

    // ── 9. Aggregate ──────────────────────────────────────────────────────────
    const { compositeScore, tier, trendDirection } = aggregateScore(
        { answerQualityScore, questionQualityScore, temporalConsistencyScore, peerValidationScore },
        previousScore
    );

    const tierChanged = crossedTierBoundary(previousScore, compositeScore);

    // ── 10. Persist ───────────────────────────────────────────────────────────
    const payload = {
        userId,
        tag,
        answerQualityScore,
        questionQualityScore,
        temporalConsistencyScore,
        peerValidationScore,
        compositeScore,
        tier,
        scoreSevenDaysAgo,
        trendDirection,
        totalAnswers:          taggedAnswers.length,
        acceptedAnswers:       taggedAnswers.filter((a: any) => a.isAccepted).length,
        totalQuestions:        userQuestions.length,
        totalUpvotesReceived:  Array.from(answerUpvotes.values()).reduce((s, v) => s + v, 0) +
                               Array.from(questionUpvotes.values()).reduce((s, v) => s + v, 0),
        lastCalculatedAt: now,
        lastActivityAt:   allActivityDates.length > 0
            ? allActivityDates.sort().at(-1)!
            : now,
    };

    let documentId: string;
    if (existingDoc) {
        await databases.updateDocument(db, userSkillScoresCollection, existingDoc.$id, payload);
        documentId = existingDoc.$id;
    } else {
        const created = await databases.createDocument(
            db,
            userSkillScoresCollection,
            ID.unique(),
            payload
        );
        documentId = created.$id;
    }

    // ── 11. Write audit log entry ─────────────────────────────────────────────
    try {
        await databases.createDocument(db, skillCalcEventsCollection, ID.unique(), {
            userId,
            tag,
            triggerType,
            priority:   "normal",
            status:     "completed",
            previousScore,
            newScore:   compositeScore,
            scheduledAt: now,
            completedAt: new Date().toISOString(),
        });
    } catch {
        // Non-fatal — audit log failure should never break score writes
    }

    return { userId, tag, compositeScore, tier, previousScore, tierChanged, documentId };
}
