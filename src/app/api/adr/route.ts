import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, getOptionalAuthenticatedUserId } from "@/lib/auth";
import { databases } from "@/models/server/config";
import {
    adrScoreSubmissionsCollection,
    adrQuestionMetadataCollection,
    ADR_DIMENSIONS,
    db,
    type AdrExpertiseLevel,
} from "@/models/name";
import { getAuthorsById } from "@/lib/authors";
import { enqueueAdrConsensusCheck } from "@/lib/adr/enqueueConsensusCheck";
import { writeReputationEvent } from "@/lib/write-reputation-event";
import { ID, Query } from "node-appwrite";
import { users } from "@/models/server/config";

const EXPERTISE_LEVELS: readonly AdrExpertiseLevel[] = ["novice", "intermediate", "expert"];

/**
 * Validates a score object against the question's selected dimensions.
 * Per Phase 3, Decision 3: full score-card submissions are all-or-nothing —
 * exactly the dimensions the author selected, no extra keys, no missing
 * keys, every value an integer 1-5.
 */
function validateScores(scores: unknown, dimensionIds: string[]): string | null {
    if (typeof scores !== "object" || scores === null || Array.isArray(scores)) {
        return "Scores must be an object";
    }
    const keys = Object.keys(scores as Record<string, unknown>);
    const dimensionSet = new Set(dimensionIds);
    if (keys.length !== dimensionIds.length || !keys.every((k) => dimensionSet.has(k))) {
        return "Scores must cover exactly the question's selected dimensions — no missing or extra keys";
    }
    for (const key of keys) {
        const value = (scores as Record<string, unknown>)[key];
        if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
            return `Score for "${key}" must be an integer between 1 and 5`;
        }
    }
    return null;
}

async function getAdrDimensions(questionId: string): Promise<string[] | null> {
    const metadataDocs = await databases.listDocuments(db, adrQuestionMetadataCollection, [
        Query.equal("questionId", questionId),
        Query.limit(1),
    ]);
    const metadata = metadataDocs.documents[0];
    if (!metadata) return null;
    try {
        const parsed = JSON.parse(metadata.adrDimensions as string);
        return Array.isArray(parsed) ? parsed.filter((d) => typeof d === "string") : [];
    } catch {
        return [];
    }
}

// Recomputes and persists the denormalized submission count on the sidecar
// document (same pattern as totalAnswers in the answer route: recount via
// listDocuments().total rather than a blind increment, so it self-heals if
// it ever drifts).
async function syncAdrSubmissionCount(questionId: string): Promise<void> {
    try {
        const [count, metadataDocs] = await Promise.all([
            databases.listDocuments(db, adrScoreSubmissionsCollection, [
                Query.equal("questionId", questionId),
                Query.limit(1),
            ]),
            databases.listDocuments(db, adrQuestionMetadataCollection, [
                Query.equal("questionId", questionId),
                Query.limit(1),
            ]),
        ]);
        const metadata = metadataDocs.documents[0];
        if (!metadata) return;
        await databases.updateDocument(db, adrQuestionMetadataCollection, metadata.$id, {
            adrSubmissionCount: count.total,
        });
    } catch (err) {
        console.error(`[api/adr] Failed to sync adrSubmissionCount for ${questionId}:`, err);
    }
}

export async function GET(req: NextRequest) {
    try {
        const questionId = req.nextUrl.searchParams.get("questionId");
        if (!questionId) return NextResponse.json({ error: "questionId required" }, { status: 400 });

        const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 100, 100);
        const cursor = req.nextUrl.searchParams.get("cursor") || undefined;

        const requesterId = await getOptionalAuthenticatedUserId();

        const queries = [Query.equal("questionId", questionId), Query.limit(limit)];
        if (cursor) queries.push(Query.cursorAfter(cursor));

        const submissions = await databases.listDocuments(db, adrScoreSubmissionsCollection, queries);

        const authors = await getAuthorsById(submissions.documents.map((doc) => doc.userId as string));

        // Never return raw userId — sanitized authorName/authorReputation only,
        // to prevent targeted harassment of low-scorers (Phase 3).
        const sanitized = submissions.documents.map((doc) => {
            const author = authors.get(doc.userId as string);
            return {
                $id: doc.$id,
                optionAScores: doc.optionAScores,
                optionBScores: doc.optionBScores,
                expertise: doc.expertise,
                reasoning: doc.reasoning,
                submittedAt: doc.submittedAt,
                updatedAt: doc.updatedAt,
                authorName: author?.name ?? "Deleted User",
                authorReputation: author?.reputation ?? 0,
            };
        });

        // If the requester has their own submission, surface it separately
        // (raw scores + submissionId) so the client can populate an edit form
        // without a second request.
        let mySubmission = null;
        if (requesterId) {
            const mine = submissions.documents.find((doc) => doc.userId === requesterId);
            if (mine) {
                mySubmission = {
                    submissionId: mine.$id,
                    optionAScores: JSON.parse(mine.optionAScores as string),
                    optionBScores: JSON.parse(mine.optionBScores as string),
                    expertise: mine.expertise,
                    reasoning: mine.reasoning,
                };
            } else {
                // Not on this page (pagination/limit) — look it up directly.
                const own = await databases
                    .listDocuments(db, adrScoreSubmissionsCollection, [
                        Query.equal("questionId", questionId),
                        Query.equal("userId", requesterId),
                        Query.limit(1),
                    ])
                    .catch(() => null);
                const doc = own?.documents[0];
                if (doc) {
                    mySubmission = {
                        submissionId: doc.$id,
                        optionAScores: JSON.parse(doc.optionAScores as string),
                        optionBScores: JSON.parse(doc.optionBScores as string),
                        expertise: doc.expertise,
                        reasoning: doc.reasoning,
                    };
                }
            }
        }

        return NextResponse.json({
            data: {
                documents: sanitized,
                total: submissions.total,
                mySubmission,
            },
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = await getAuthenticatedUserId();
        const body = await req.json();
        const { questionId, optionAScores, optionBScores, expertise, reasoning } = body;

        if (!questionId) {
            return NextResponse.json({ error: "questionId is required" }, { status: 400 });
        }
        if (!EXPERTISE_LEVELS.includes(expertise)) {
            return NextResponse.json({ error: "expertise must be novice, intermediate, or expert" }, { status: 400 });
        }

        const dimensionIds = await getAdrDimensions(questionId);
        if (!dimensionIds) {
            return NextResponse.json({ error: "Question is not an ADR question" }, { status: 400 });
        }

        const parsedA = typeof optionAScores === "string" ? JSON.parse(optionAScores) : optionAScores;
        const parsedB = typeof optionBScores === "string" ? JSON.parse(optionBScores) : optionBScores;
        const errorA = validateScores(parsedA, dimensionIds);
        if (errorA) return NextResponse.json({ error: `optionAScores: ${errorA}` }, { status: 400 });
        const errorB = validateScores(parsedB, dimensionIds);
        if (errorB) return NextResponse.json({ error: `optionBScores: ${errorB}` }, { status: 400 });

        let doc;
        try {
            doc = await databases.createDocument(db, adrScoreSubmissionsCollection, ID.unique(), {
                questionId,
                userId,
                optionAScores: JSON.stringify(parsedA),
                optionBScores: JSON.stringify(parsedB),
                expertise,
                reasoning: typeof reasoning === "string" ? reasoning.slice(0, 1000) : null,
                submittedAt: new Date().toISOString(),
            });
        } catch (err: any) {
            // Unique index on (questionId, userId) — one submission per user.
            if (err?.code === 409) {
                return NextResponse.json(
                    { error: "You've already scored this comparison. Edit your existing submission instead." },
                    { status: 409 }
                );
            }
            throw err;
        }

        await syncAdrSubmissionCount(questionId);

        await enqueueAdrConsensusCheck(questionId).catch((err) => {
            console.error(`[api/adr/POST] Failed to enqueue CheckAdrConsensus for ${questionId}:`, err);
        });

        // ── Phase 9: Reputation Bonus (+2) ──
        try {
            const prefs = await users.getPrefs(userId);
            const currentRep = Number(prefs.reputation ?? 0);
            const nextRep = currentRep + 2;
            await users.updatePrefs(userId, { ...prefs, reputation: nextRep });

            await writeReputationEvent({
                userId,
                delta: 2,
                eventType: "adr_score_submitted",
                reputationAfter: nextRep,
                sourceId: doc.$id,
                sourceType: "adr_submission",
            });
        } catch (repErr) {
            console.error(`[api/adr/POST] Failed to award reputation for userId=${userId}:`, repErr);
        }

        return NextResponse.json(doc, { status: 201 });
    } catch (err: any) {
        if (err instanceof Response) return err;
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    try {
        const userId = await getAuthenticatedUserId();
        const body = await req.json();
        const { submissionId, optionAScores, optionBScores, expertise, reasoning } = body;

        if (!submissionId) {
            return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
        }

        // Ensure the user actually owns this submission
        const existing = await databases.getDocument(db, adrScoreSubmissionsCollection, submissionId);
        if (existing.userId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (expertise !== undefined && !EXPERTISE_LEVELS.includes(expertise)) {
            return NextResponse.json({ error: "expertise must be novice, intermediate, or expert" }, { status: 400 });
        }

        const dimensionIds = await getAdrDimensions(existing.questionId as string);
        if (!dimensionIds) {
            return NextResponse.json({ error: "Question is not an ADR question" }, { status: 400 });
        }

        const parsedA = typeof optionAScores === "string" ? JSON.parse(optionAScores) : optionAScores;
        const parsedB = typeof optionBScores === "string" ? JSON.parse(optionBScores) : optionBScores;
        const errorA = validateScores(parsedA, dimensionIds);
        if (errorA) return NextResponse.json({ error: `optionAScores: ${errorA}` }, { status: 400 });
        const errorB = validateScores(parsedB, dimensionIds);
        if (errorB) return NextResponse.json({ error: `optionBScores: ${errorB}` }, { status: 400 });

        const doc = await databases.updateDocument(db, adrScoreSubmissionsCollection, submissionId, {
            optionAScores: JSON.stringify(parsedA),
            optionBScores: JSON.stringify(parsedB),
            expertise,
            reasoning: typeof reasoning === "string" ? reasoning.slice(0, 1000) : null,
            updatedAt: new Date().toISOString(),
            // submittedAt is intentionally never touched — original date preserved.
        });

        await enqueueAdrConsensusCheck(doc.questionId as string).catch((err) => {
            console.error(`[api/adr/PATCH] Failed to enqueue CheckAdrConsensus for ${doc.questionId}:`, err);
        });

        return NextResponse.json(doc);
    } catch (err: any) {
        if (err instanceof Response) return err;
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
