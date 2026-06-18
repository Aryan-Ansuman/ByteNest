import { answerCollection, db, questionCollection, voteCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { ApiValidationError, parseJsonBody, requireEnum, requireString } from "@/lib/api-validation";
import { withMutex } from "@/lib/mutex";
import { adjustReputation } from "@/lib/reputation";

const VOTE_TYPES = ["question", "answer"] as const;
const VOTE_STATUSES = ["upvoted", "downvoted"] as const;
type VoteType = (typeof VOTE_TYPES)[number];
type VoteStatusValue = (typeof VOTE_STATUSES)[number];

function collectionFor(type: VoteType) {
    return type === "question" ? questionCollection : answerCollection;
}

/**
 * Adjusts the denormalized `totalVotes` attribute via Appwrite's atomic
 * increment/decrement-attribute calls instead of read-then-write, removing
 * the counter's lost-update race entirely. Falls back to a mutex-guarded
 * read-then-write only if those calls aren't available on the installed
 * node-appwrite version.
 */
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

        if (!typeParam || !typeId || !votedById) {
            return NextResponse.json(
                { error: "type, typeId, and votedById are required" },
                { status: 400 }
            );
        }

        const type = requireEnum(typeParam, VOTE_TYPES, "type");

        const response = await databases.listDocuments(db, voteCollection, [
            Query.equal("type", type),
            Query.equal("typeId", typeId),
            Query.equal("votedById", votedById),
            Query.limit(1),
        ]);

        return NextResponse.json(
            { data: { document: response.documents[0] ?? null } },
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

/**
 * Casts, flips, or withdraws a vote. Net delta is computed once, up front:
 * the new vote's own effect, plus (if a previous vote existed) undoing that
 * previous vote's effect — a flip from upvoted to downvoted is a swing of
 * -2, not 0.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);

        const votedById = requireString(body.votedById, "votedById");
        const typeId = requireString(body.typeId, "typeId");
        const type = requireEnum(body.type, VOTE_TYPES, "type");
        const voteStatus = requireEnum(body.voteStatus, VOTE_STATUSES, "voteStatus");

        const collection = collectionFor(type);

        return await withMutex(`vote:${type}:${typeId}:${votedById}`, async () => {
            let targetDoc;
            try {
                targetDoc = await databases.getDocument(db, collection, typeId);
            } catch {
                return NextResponse.json(
                    { message: "The question or answer you're voting on no longer exists" },
                    { status: 404 }
                );
            }

            if (targetDoc.authorId === votedById) {
                return NextResponse.json(
                    { message: "You can't vote on your own post" },
                    { status: 403 }
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
                    { status: 200 }
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
                { status: 201 }
            );
        });
    } catch (error: any) {
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ message: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { message: error?.message || "Error processing vote" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
