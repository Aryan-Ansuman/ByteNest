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

// Tallies the GLOBAL vote score for a target — every voter, not just one user.
async function getVoteResult(type: string, typeId: string) {
    const [upvotes, downvotes] = await Promise.all([
        databases.listDocuments(db, voteCollection, [
            Query.equal("type", type),
            Query.equal("typeId", typeId),
            Query.equal("voteStatus", "upvoted"),
            Query.limit(1), // we only need `.total`, not the documents
        ]),
        databases.listDocuments(db, voteCollection, [
            Query.equal("type", type),
            Query.equal("typeId", typeId),
            Query.equal("voteStatus", "downvoted"),
            Query.limit(1),
        ]),
    ]);
    return upvotes.total - downvotes.total;
}

export async function POST(request: NextRequest) {
    try {
        const { votedById, voteStatus, type, typeId } = await request.json();

        const response = await databases.listDocuments(db, voteCollection, [
            Query.equal("type", type),
            Query.equal("typeId", typeId),
            Query.equal("votedById", votedById),
        ]);

        if (response.documents.length > 0) {
            await databases.deleteDocument(db, voteCollection, response.documents[0].$id);

            // Decrease the reputation of the question/answer author
            const questionOrAnswer = await databases.getDocument(
                db,
                type === "question" ? questionCollection : answerCollection,
                typeId
            );

            const authorPrefs = await users.getPrefs<UserPrefs>(questionOrAnswer.authorId);

            await users.updatePrefs<UserPrefs>(questionOrAnswer.authorId, {
                reputation:
                    response.documents[0].voteStatus === "upvoted"
                        ? Number(authorPrefs.reputation) - 1
                        : Number(authorPrefs.reputation) + 1,
            });
        }

        // that means prev vote does not exist, or voteStatus changed
        if (response.documents[0]?.voteStatus !== voteStatus) {
            const doc = await databases.createDocument(db, voteCollection, ID.unique(), {
                type,
                typeId,
                voteStatus,
                votedById,
            });

            // Increase/decrease the reputation of the question/answer author accordingly
            const questionOrAnswer = await databases.getDocument(
                db,
                type === "question" ? questionCollection : answerCollection,
                typeId
            );

            const authorPrefs = await users.getPrefs<UserPrefs>(questionOrAnswer.authorId);

            if (response.documents[0]) {
                await users.updatePrefs<UserPrefs>(questionOrAnswer.authorId, {
                    reputation:
                        response.documents[0].voteStatus === "upvoted"
                            ? Number(authorPrefs.reputation) - 1
                            : Number(authorPrefs.reputation) + 1,
                });
            } else {
                await users.updatePrefs<UserPrefs>(questionOrAnswer.authorId, {
                    reputation:
                        voteStatus === "upvoted"
                            ? Number(authorPrefs.reputation) + 1
                            : Number(authorPrefs.reputation) - 1,
                });
            }

            const voteResult = await getVoteResult(type, typeId);

            return NextResponse.json(
                {
                    data: { document: doc, voteResult },
                    message: response.documents[0] ? "Vote Status Updated" : "Voted",
                },
                { status: 201 }
            );
        }

        const voteResult = await getVoteResult(type, typeId);

        return NextResponse.json(
            {
                data: { document: null, voteResult },
                message: "Vote Withdrawn",
            },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { message: error?.message || "Error processing vote" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
