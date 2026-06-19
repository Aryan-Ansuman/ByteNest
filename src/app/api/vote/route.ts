import { answerCollection, db, questionCollection, voteCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { ApiValidationError, parseJsonBody, requireEnum, requireString } from "@/lib/api-validation";
import { withMutex } from "@/lib/mutex";
import { adjustReputation } from "@/lib/reputation";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getAuthenticatedUserId } from "@/lib/auth";

const VOTE_TYPES = ["question", "answer"] as const;
const VOTE_STATUSES = ["upvoted", "downvoted"] as const;
type VoteType = (typeof VOTE_TYPES)[number];
type VoteStatusValue = (typeof VOTE_STATUSES)[number];

// Rate limit: 30 vote actions per user per minute
const VOTE_RATE_LIMIT = 30;
const VOTE_WINDOW_MS = 60_000;

function collectionFor(type: VoteType) {
    return type === "question" ? questionCollection : answerCollection;
}

async function adjustVoteCounter(type: VoteType, typeId: string, delta: number): Promise<number> {
    const collection = collectionFor(type);

    if (delta === 0) {
        const doc = await databases.getDocument(db, collection, typeId);
        return Number(doc.totalVotes ?? 0);
    }

    try {
        const updated =
            delta > 0
                ? await (databases as any).incrementDocumentAttribute(db, collection, typeId, "totalVotes", delta)
                : await (databases as any).decrementDocumentAttribute(
                      db,
                      collection,
                      typeId,
                      "totalVotes",
                      Math.abs(delta)
                  );
        return Number(updated.totalVotes ?? 0);
    } catch (err) {
        console.warn(
            "[vote] atomic increment/decrement unavailable, falling back to read-then-write",
            err
        );
        return withMutex(`votecounter:${type}:${typeId}`, async () => {
            const doc = await databases.getDocument(db, collection, typeId);
            const next = Number(doc.totalVotes ?? 0) + delta;
            await databases.updateDocument(db, collection, typeId, { totalVotes: next });
            return next;
        });
    }
}

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const typeParam = searchParams.get("type");
        const typeId = searchParams.get("typeId");
        const votedById = searchParams.get("votedById");

        if (!typeParam || !typeId) {
            return NextResponse.json(
                { error: "type and typeId are required" },
                { status: 400 }
            );
        }

        const type = requireEnum(typeParam, VOTE_TYPES, "type");
        const collection = type === "question" ? questionCollection : answerCollection;

        const [voteResponse, targetDoc] = await Promise.all([
            votedById
                ? databases.listDocuments(db, voteCollection, [
                      Query.equal("type", type),
                      Query.equal("typeId", typeId),
                      Query.equal("votedById", votedById),
                      Query.limit(1),
                  ])
                : Promise.resolve({ documents: [] }),
            databases.getDocument(db, collection, typeId).catch(() => null),
        ]);

        return NextResponse.json(
            {
                data: {
                    document: voteResponse.documents[0] ?? null,
                    totalVotes: targetDoc ? Number(targetDoc.totalVotes ?? 0) : 0,
                },
            },
            { status: 200 }
        );
    } catch (error: any) {
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error fetching vote" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);

        const votedById = requireString(body.votedById, "votedById");
        const typeId = requireString(body.typeId, "typeId");
        const type = requireEnum(body.type, VOTE_TYPES, "type");
        const voteStatus = requireEnum(body.voteStatus, VOTE_STATUSES, "voteStatus");

        const requesterId = await getAuthenticatedUserId();
        if (votedById !== requesterId) {
            console.error("VOTE 403 - ID Mismatch", { votedById, requesterId });
            return NextResponse.json({ message: "Unauthorized: votedById mismatch" }, { status: 403 });
        }

        // Rate limit per user
        const rl = rateLimit({
            key: `vote:${votedById}`,
            limit: VOTE_RATE_LIMIT,
            windowMs: VOTE_WINDOW_MS,
        });
        const rlHeaders = rateLimitHeaders(rl, VOTE_RATE_LIMIT);

        if (!rl.success) {
            return NextResponse.json(
                { message: "Too many vote actions. Please slow down." },
                { status: 429, headers: rlHeaders }
            );
        }

        const collection = collectionFor(type);

        return await withMutex(`vote:${type}:${typeId}:${votedById}`, async () => {
            let targetDoc;
            try {
                targetDoc = await databases.getDocument(db, collection, typeId);
            } catch {
                return NextResponse.json(
                    { message: "The question or answer you're voting on no longer exists" },
                    { status: 404, headers: rlHeaders }
                );
            }

            if (targetDoc.authorId === votedById) {
                console.error("VOTE 403 - Own Post", { votedById, authorId: targetDoc.authorId });
                return NextResponse.json(
                    { message: "You can't vote on your own post" },
                    { status: 403, headers: rlHeaders }
                );
            }

            const existing = await databases.listDocuments(db, voteCollection, [
                Query.equal("type", type),
                Query.equal("typeId", typeId),
                Query.equal("votedById", votedById),
                Query.limit(1),
            ]);

            const previousVote = existing.documents[0] ?? null;
            const previousStatus = (previousVote?.voteStatus as VoteStatusValue) ?? null;

            if (previousVote) {
                await databases.deleteDocument(db, voteCollection, previousVote.$id);
            }

            if (previousStatus === voteStatus) {
                const undoDelta = previousStatus === "upvoted" ? -1 : 1;

                const [newTotal] = await Promise.all([
                    adjustVoteCounter(type, typeId, undoDelta),
                    adjustReputation(targetDoc.authorId, undoDelta),
                ]);

                return NextResponse.json(
                    { data: { document: null, voteResult: newTotal }, message: "Vote withdrawn" },
                    { status: 200, headers: rlHeaders }
                );
            }

            const newVoteDoc = await databases.createDocument(db, voteCollection, ID.unique(), {
                type,
                typeId,
                voteStatus,
                votedById,
            });

            let delta = voteStatus === "upvoted" ? 1 : -1;
            if (previousVote) {
                delta += previousStatus === "upvoted" ? -1 : 1;
            }

            const [newTotal] = await Promise.all([
                adjustVoteCounter(type, typeId, delta),
                adjustReputation(targetDoc.authorId, delta),
            ]);

            return NextResponse.json(
                {
                    data: { document: newVoteDoc, voteResult: newTotal },
                    message: previousVote ? "Vote status updated" : "Voted",
                },
                { status: 201, headers: rlHeaders }
            );
        });
    } catch (error: any) {
        console.error("VOTE API ERROR:", error);
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { message: error?.message || "Error processing vote" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
