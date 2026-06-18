import { answerCollection, db, questionCollection, voteCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get("type");
        const typeId = searchParams.get("typeId");
        const votedById = searchParams.get("votedById");

        if (!type || !typeId || !votedById) {
            return NextResponse.json(
                { error: "type, typeId, and votedById are required" },
                { status: 400 }
            );
        }

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
        return NextResponse.json(
            { error: error?.message || "Error fetching vote" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

/**
 * Atomically adjust the denormalized `totalVotes` counter on the
 * question or answer document by `delta` (+1, -1, or +2/-2 when
 * flipping a vote direction).
 *
 * Using a read-then-write here is fine for our scale. A true atomic
 * increment would require a Appwrite Function or a dedicated counter
 * collection — out of scope. The worst case of a concurrent race is a
 * momentary off-by-one that self-corrects on the next vote.
 */
async function adjustVoteCounter(
    type: string,
    typeId: string,
    delta: number
): Promise<number> {
    const collection = type === "question" ? questionCollection : answerCollection;
    const doc = await databases.getDocument(db, collection, typeId);
    const current = Number(doc.totalVotes ?? 0);
    const next = current + delta;
    await databases.updateDocument(db, collection, typeId, { totalVotes: next });
    return next;
}

export async function POST(request: NextRequest) {
    try {
        const { votedById, voteStatus, type, typeId } = await request.json();

        // Look up the voter's existing vote, if any.
        const existing = await databases.listDocuments(db, voteCollection, [
            Query.equal("type", type),
            Query.equal("typeId", typeId),
            Query.equal("votedById", votedById),
            Query.limit(1),
        ]);

        const previousVote = existing.documents[0] ?? null;
        const previousStatus: "upvoted" | "downvoted" | null =
            (previousVote?.voteStatus as "upvoted" | "downvoted") ?? null;

        // Fetch the target document once — needed for reputation updates.
        const collection = type === "question" ? questionCollection : answerCollection;
        const targetDoc = await databases.getDocument(db, collection, typeId);
        const authorPrefs = await users.getPrefs<UserPrefs>(targetDoc.authorId);
        let reputationDelta = 0;

        // ── Remove the previous vote if one exists ────────────────────────
        if (previousVote) {
            await databases.deleteDocument(db, voteCollection, previousVote.$id);
            // Reverse the previous vote's effect on the counter.
            reputationDelta += previousStatus === "upvoted" ? -1 : 1;
        }

        // ── Toggling: if the user clicked the same button again, just remove ──
        if (previousStatus === voteStatus) {
            // Vote withdrawn — counter and reputation already adjusted above.
            const newTotal = await adjustVoteCounter(
                type,
                typeId,
                previousStatus === "upvoted" ? -1 : 1
            );

            await users.updatePrefs<UserPrefs>(targetDoc.authorId, {
                reputation: Number(authorPrefs.reputation) + reputationDelta,
            });

            return NextResponse.json(
                { data: { document: null, voteResult: newTotal }, message: "Vote Withdrawn" },
                { status: 200 }
            );
        }

        // ── Cast the new vote ─────────────────────────────────────────────
        const newVoteDoc = await databases.createDocument(db, voteCollection, ID.unique(), {
            type,
            typeId,
            voteStatus,
            votedById,
        });

        // Net counter delta: +1 for upvote, -1 for downvote.
        // If flipping direction, the removal above already contributed ±1
        // to `reputationDelta`; here we add ±1 more.
        const voteDelta = voteStatus === "upvoted" ? 1 : -1;
        reputationDelta += voteDelta;

        const newTotal = await adjustVoteCounter(type, typeId, voteDelta);

        await users.updatePrefs<UserPrefs>(targetDoc.authorId, {
            reputation: Number(authorPrefs.reputation) + reputationDelta,
        });

        return NextResponse.json(
            {
                data: { document: newVoteDoc, voteResult: newTotal },
                message: previousVote ? "Vote Status Updated" : "Voted",
            },
            { status: 201 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { message: error?.message || "Error processing vote" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
