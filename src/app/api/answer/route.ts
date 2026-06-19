import { answerCollection, db, questionCollection, voteCollection, commentCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { UserPrefs } from "@/store/Auth";
import { getAuthenticatedUserId, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";

export async function POST(request: NextRequest) {
    try {
        const requesterId = await getAuthenticatedUserId();

        const { questionId, answer, authorId } = await request.json();

        if (authorId !== requesterId) {
            return forbiddenResponse("authorId does not match authenticated user");
        }

        const response = await databases.createDocument(db, answerCollection, ID.unique(), {
            content: answer,
            authorId,
            questionId,
            isAccepted: false,
        });

        const prefs = await users.getPrefs<UserPrefs>(authorId);
        await users.updatePrefs(authorId, {
            reputation: Number(prefs.reputation) + 1,
        });

        return NextResponse.json(response, { status: 201 });
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error creating answer" },
            { status: e?.status || e?.code || 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const requesterId = await getAuthenticatedUserId();

        const { answerId, questionId, accept } = await request.json();

        if (!answerId || !questionId || typeof accept !== "boolean") {
            return NextResponse.json(
                { error: "answerId, questionId, and accept (boolean) are required" },
                { status: 400 }
            );
        }

        const question = await databases.getDocument(db, questionCollection, questionId);
        if (question.authorId !== requesterId) {
            return forbiddenResponse("Only the question author can accept or unaccept answers");
        }

        if (accept) {
            const alreadyAccepted = await databases.listDocuments(db, answerCollection, [
                Query.equal("questionId", questionId),
                Query.equal("isAccepted", true),
                Query.limit(5),
            ]);
            await Promise.all(
                alreadyAccepted.documents
                    .filter((a) => a.$id !== answerId)
                    .map((a) =>
                        databases.updateDocument(db, answerCollection, a.$id, {
                            isAccepted: false,
                        })
                    )
            );
        }

        const updated = await databases.updateDocument(db, answerCollection, answerId, {
            isAccepted: accept,
        });

        return NextResponse.json({ data: updated }, { status: 200 });
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error updating answer" },
            { status: e?.status || e?.code || 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    let requesterId: string;
    try {
        requesterId = await getAuthenticatedUserId();
    } catch (authError) {
        if (authError instanceof Response) return authError;
        return unauthorizedResponse("Authentication required");
    }

    try {
        const { answerId } = await request.json();

        if (!answerId) {
            return NextResponse.json({ error: "answerId is required" }, { status: 400 });
        }

        let answer: Awaited<ReturnType<typeof databases.getDocument>>;
        try {
            answer = await databases.getDocument(db, answerCollection, answerId);
        } catch {
            return NextResponse.json(
                { data: { $id: answerId }, message: "Answer not found or already deleted" },
                { status: 200 }
            );
        }

        if (answer.authorId !== requesterId) {
            return forbiddenResponse("You are not the author of this answer");
        }

        const authorId = answer.authorId as string;

        const prefsSnapshot = await users.getPrefs<UserPrefs>(authorId);
        const reputationBefore = Number(prefsSnapshot.reputation ?? 0);

        const [votes, comments] = await Promise.all([
            databases.listDocuments(db, voteCollection, [
                Query.equal("type", "answer"),
                Query.equal("typeId", answerId),
                Query.limit(5000),
            ]),
            databases.listDocuments(db, commentCollection, [
                Query.equal("type", "answer"),
                Query.equal("typeId", answerId),
                Query.limit(5000),
            ]),
        ]);

        await databases.deleteDocument(db, answerCollection, answerId);

        await Promise.allSettled([
            ...votes.documents.map((v) =>
                databases.deleteDocument(db, voteCollection, v.$id)
            ),
            ...comments.documents.map((c) =>
                databases.deleteDocument(db, commentCollection, c.$id)
            ),
        ]);

        try {
            const freshPrefs = await users.getPrefs<UserPrefs>(authorId);
            await users.updatePrefs<UserPrefs>(authorId, {
                reputation: Number(freshPrefs.reputation ?? 0) - 1,
            });
        } catch (repError: any) {
            console.error(
                "[answer/DELETE] reputation decrement failed after document deletion",
                { answerId, authorId, reputationBefore, error: repError?.message }
            );
            return NextResponse.json(
                {
                    data: { $id: answerId },
                    warning:
                        "Answer deleted but reputation update failed. This will be reconciled.",
                },
                { status: 207 }
            );
        }

        return NextResponse.json(
            { data: { $id: answerId }, message: "Answer deleted" },
            { status: 200 }
        );
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { message: e?.message || "Error deleting the answer" },
            { status: e?.status || e?.code || 500 }
        );
    }
}