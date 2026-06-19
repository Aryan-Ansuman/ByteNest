import { answerCollection, db, questionCollection, voteCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { ApiValidationError, parseJsonBody, requireEnum, requireString } from "@/lib/api-validation";
import { adjustReputation } from "@/lib/reputation";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getAuthenticatedUserId } from "@/lib/auth";
import { revalidateQuestionCaches } from "@/lib/cache-invalidation";
import { createHash } from "crypto";

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

    const [upvotes, downvotes] = await Promise.all([
        databases.listDocuments(db, voteCollection, [
            Query.equal("type", type),
            Query.equal("typeId", typeId),
            Query.equal("voteStatus", "upvoted"),
            Query.limit(1),
        ]),
        databases.listDocuments(db, voteCollection, [
            Query.equal("type", type),
            Query.equal("typeId", typeId),
            Query.equal("voteStatus", "downvoted"),
            Query.limit(1),
        ]),
    ]);
    const next = upvotes.total - downvotes.total;
    await databases.updateDocument(db, collection, typeId, { totalVotes: next });
    return next;
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

        if (votedById) {
            const requesterId = await getAuthenticatedUserId();
            if (votedById !== requesterId) {
                return NextResponse.json({ error: "Unauthorized: votedById mismatch" }, { status: 403 });
            }
        }

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
        if (error instanceof Response) return error;
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
        const rl = await rateLimit({
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

        {
            const collection = collectionFor(type);
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
                Query.limit(10),
            ]);

            const previousVote = existing.documents[0] ?? null;
            const previousStatus = (previousVote?.voteStatus as VoteStatusValue) ?? null;
            const duplicateVotes = existing.documents.slice(1);
            await Promise.allSettled(
                duplicateVotes.map((vote) =>
                    databases.deleteDocument(db, voteCollection, vote.$id)
                )
            );

            if (previousStatus === voteStatus) {
                const undoDelta = previousStatus === "upvoted" ? -1 : 1;
                await databases.deleteDocument(db, voteCollection, previousVote.$id);

                const [newTotal] = await Promise.all([
                    adjustVoteCounter(type, typeId, undoDelta),
                    adjustReputation(targetDoc.authorId, undoDelta),
                ]);
                await revalidateVotedTarget(type, targetDoc);

                return NextResponse.json(
                    { data: { document: null, voteResult: newTotal }, message: "Vote withdrawn" },
                    { status: 200, headers: rlHeaders }
                );
            }

            const voteDocId = voteDocumentId(type, typeId, votedById);
            const newVoteDoc = previousVote
                ? await databases.updateDocument(db, voteCollection, previousVote.$id, {
                      voteStatus,
                  })
                : await createDeterministicVoteDocument(voteDocId, {
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
            await revalidateVotedTarget(type, targetDoc);

            return NextResponse.json(
                {
                    data: { document: newVoteDoc, voteResult: newTotal },
                    message: previousVote ? "Vote status updated" : "Voted",
                },
                { status: 201, headers: rlHeaders }
            );
        }
    } catch (error: any) {
        if (error instanceof Response) return error;
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

function voteDocumentId(type: VoteType, typeId: string, votedById: string) {
    return createHash("sha256")
        .update(`${type}:${typeId}:${votedById}`)
        .digest("hex")
        .slice(0, 32);
}

async function createDeterministicVoteDocument(
    documentId: string,
    data: {
        type: VoteType;
        typeId: string;
        voteStatus: VoteStatusValue;
        votedById: string;
    }
) {
    try {
        return await databases.createDocument(db, voteCollection, documentId, data);
    } catch (error: any) {
        if (error?.code !== 409) throw error;
        return databases.updateDocument(db, voteCollection, documentId, {
            voteStatus: data.voteStatus,
        });
    }
}

async function revalidateVotedTarget(
    type: VoteType,
    targetDoc: Awaited<ReturnType<typeof databases.getDocument>>
) {
    if (type === "question") {
        await revalidateQuestionCaches(targetDoc.$id, [targetDoc.title as string]);
        return;
    }

    await revalidateQuestionCaches(targetDoc.questionId as string);
}
