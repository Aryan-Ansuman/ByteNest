import { answerCollection, db, questionCollection, voteCollection, commentCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { ApiValidationError, parseJsonBody, requireString } from "@/lib/api-validation";
import { adjustReputation } from "@/lib/reputation";

export async function POST(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);

        const questionId = requireString(body.questionId, "questionId");
        const content = requireString(body.answer, "answer", { max: 10000 });
        const authorId = requireString(body.authorId, "authorId");

        // Make sure the question still exists before attaching an answer to
        // it (and before handing out reputation for it).
        try {
            await databases.getDocument(db, questionCollection, questionId);
        } catch {
            return NextResponse.json({ error: "This question no longer exists" }, { status: 404 });
        }

        const response = await databases.createDocument(db, answerCollection, ID.unique(), {
            content,
            authorId,
            questionId,
            isAccepted: false,
        });

        await adjustReputation(authorId, 1);

        return NextResponse.json(response, { status: 201 });
    } catch (error: any) {
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error creating answer" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

/**
 * PATCH /api/answer
 * Accept/unaccept an answer: { answerId, questionId, requesterId, accept }.
 * Only the question author may call this.
 */
export async function PATCH(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);

        const answerId = requireString(body.answerId, "answerId");
        const questionId = requireString(body.questionId, "questionId");
        const requesterId = requireString(body.requesterId, "requesterId");

        if (typeof body.accept !== "boolean") {
            return NextResponse.json({ error: "accept (boolean) is required" }, { status: 400 });
        }
        const accept = body.accept;

        const question = await databases.getDocument(db, questionCollection, questionId);
        if (question.authorId !== requesterId) {
            return NextResponse.json(
                { error: "Only the question author can accept or unaccept answers" },
                { status: 403 }
            );
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
                        databases.updateDocument(db, answerCollection, a.$id, { isAccepted: false })
                    )
            );
        }

        const updated = await databases.updateDocument(db, answerCollection, answerId, {
            isAccepted: accept,
        });

        return NextResponse.json({ data: updated }, { status: 200 });
    } catch (error: any) {
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error updating answer" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

/**
 * DELETE /api/answer
 * Requires { answerId, authorId } and verifies authorId owns the answer —
 * previously this endpoint didn't check ownership at all.
 *
 * Reputation cleanup now undoes both the flat +1 the author got for posting
 * the answer AND the net reputation the answer accrued from its own votes;
 * previously only the +1 was undone, so a heavily-upvoted answer's
 * reputation contribution survived its own deletion.
 */
export async function DELETE(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);
        const answerId = requireString(body.answerId, "answerId");
        const authorId = requireString(body.authorId, "authorId");

        const answer = await databases.getDocument(db, answerCollection, answerId);

        if (answer.authorId !== authorId) {
            return NextResponse.json(
                { error: "You are not authorized to delete this answer" },
                { status: 403 }
            );
        }

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

        const netVoteReputation =
            votes.documents.filter((v) => v.voteStatus === "upvoted").length -
            votes.documents.filter((v) => v.voteStatus === "downvoted").length;

        await databases.deleteDocument(db, answerCollection, answerId);

        await Promise.allSettled([
            ...votes.documents.map((v) => databases.deleteDocument(db, voteCollection, v.$id)),
            ...comments.documents.map((c) => databases.deleteDocument(db, commentCollection, c.$id)),
        ]);

        try {
            await adjustReputation(answer.authorId, -(1 + netVoteReputation));
        } catch (repError: any) {
            console.error(
                "[answer/DELETE] reputation adjustment failed after document deletion",
                { answerId, authorId: answer.authorId, error: repError?.message }
            );
            return NextResponse.json(
                {
                    data: { $id: answerId },
                    warning: "Answer deleted but reputation update failed. This will be reconciled.",
                },
                { status: 207 }
            );
        }

        return NextResponse.json(
            { data: { $id: answerId }, message: "Answer deleted" },
            { status: 200 }
        );
    } catch (error: any) {
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error deleting the answer" },
            { status: error?.status || error?.code || 500 }
        );
    }
}