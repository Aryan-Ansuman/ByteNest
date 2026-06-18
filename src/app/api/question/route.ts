import { questionCollection, db, questionAttachmentBucket, answerCollection, voteCollection, commentCollection } from "@/models/name";
import { databases, storage } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { ApiValidationError, parseJsonBody, requireString, requireStringArray } from "@/lib/api-validation";
import { adjustReputation } from "@/lib/reputation";

export async function POST(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);

        const title = requireString(body.title, "title", { min: 15, max: 100 });
        const content = requireString(body.content, "content", { min: 30, max: 10000 });
        const authorId = requireString(body.authorId, "authorId");
        const tags = requireStringArray(body.tags, "tags", { min: 1, max: 5, itemMax: 25 });

        const docData: Record<string, unknown> = { title, content, authorId, tags };

        if (body.attachmentId !== undefined) {
            docData.attachmentId = requireString(body.attachmentId, "attachmentId");
        }

        const response = await databases.createDocument(db, questionCollection, ID.unique(), docData);

        return NextResponse.json(response, { status: 201 });
    } catch (error: any) {
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error creating question" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

/**
 * PATCH /api/question
 * Requires { questionId, authorId } plus any of title/content/tags/
 * attachmentId/oldAttachmentId. authorId must match the question's author —
 * previously this endpoint had no authorization check at all, and blindly
 * overwrote title/content/tags even when a caller hadn't sent them.
 */
export async function PATCH(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);

        const questionId = requireString(body.questionId, "questionId");
        const authorId = requireString(body.authorId, "authorId");

        const question = await databases.getDocument(db, questionCollection, questionId);
        if (question.authorId !== authorId) {
            return NextResponse.json(
                { error: "You are not authorized to edit this question" },
                { status: 403 }
            );
        }

        const docData: Record<string, unknown> = {};

        if (body.title !== undefined) {
            docData.title = requireString(body.title, "title", { min: 15, max: 100 });
        }
        if (body.content !== undefined) {
            docData.content = requireString(body.content, "content", { min: 30, max: 10000 });
        }
        if (body.tags !== undefined) {
            docData.tags = requireStringArray(body.tags, "tags", { min: 1, max: 5, itemMax: 25 });
        }

        const attachmentId = body.attachmentId;
        const oldAttachmentId = body.oldAttachmentId;

        if (attachmentId !== undefined) {
            if (typeof attachmentId !== "string" || !attachmentId.trim()) {
                return NextResponse.json({ error: "attachmentId must be a string" }, { status: 400 });
            }
            if (
                typeof oldAttachmentId === "string" &&
                oldAttachmentId &&
                oldAttachmentId !== attachmentId &&
                oldAttachmentId !== "none"
            ) {
                try {
                    await storage.deleteFile(questionAttachmentBucket, oldAttachmentId);
                } catch {
                    // Old file might not exist, continue
                }
            }
            docData.attachmentId = attachmentId;
        }

        if (Object.keys(docData).length === 0) {
            return NextResponse.json({ error: "No fields to update" }, { status: 400 });
        }

        const response = await databases.updateDocument(db, questionCollection, questionId, docData);

        return NextResponse.json(response, { status: 200 });
    } catch (error: any) {
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error updating question" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

/**
 * DELETE /api/question
 * authorId is now required (not optionally checked). Reputation cleanup
 * undoes the question author's vote-based reputation plus, for every
 * answer, both the flat +1 its author got for posting AND the net
 * reputation that answer accrued from its own votes — previously only the
 * flat +1 per answer was undone.
 */
export async function DELETE(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);
        const questionId = requireString(body.questionId, "questionId");
        const authorId = requireString(body.authorId, "authorId");

        const question = await databases.getDocument(db, questionCollection, questionId);

        if (question.authorId !== authorId) {
            return NextResponse.json(
                { error: "You are not authorized to delete this question" },
                { status: 403 }
            );
        }

        const [answers, questionVotes, questionComments] = await Promise.all([
            databases.listDocuments(db, answerCollection, [
                Query.equal("questionId", questionId),
                Query.limit(5000),
            ]),
            databases.listDocuments(db, voteCollection, [
                Query.equal("type", "question"),
                Query.equal("typeId", questionId),
                Query.limit(5000),
            ]),
            databases.listDocuments(db, commentCollection, [
                Query.equal("type", "question"),
                Query.equal("typeId", questionId),
                Query.limit(5000),
            ]),
        ]);

        const perAnswerCleanup = await Promise.all(
            answers.documents.map(async (answer) => {
                const [answerVotes, answerComments] = await Promise.all([
                    databases.listDocuments(db, voteCollection, [
                        Query.equal("type", "answer"),
                        Query.equal("typeId", answer.$id),
                        Query.limit(5000),
                    ]),
                    databases.listDocuments(db, commentCollection, [
                        Query.equal("type", "answer"),
                        Query.equal("typeId", answer.$id),
                        Query.limit(5000),
                    ]),
                ]);
                return { answer, answerVotes, answerComments };
            })
        );

        await Promise.all(
            perAnswerCleanup.flatMap(({ answerVotes, answerComments }) => [
                ...answerVotes.documents.map((v) => databases.deleteDocument(db, voteCollection, v.$id)),
                ...answerComments.documents.map((c) => databases.deleteDocument(db, commentCollection, c.$id)),
            ])
        );

        await Promise.all(
            perAnswerCleanup.map(({ answer }) => databases.deleteDocument(db, answerCollection, answer.$id))
        );

        await Promise.all([
            ...questionVotes.documents.map((v) => databases.deleteDocument(db, voteCollection, v.$id)),
            ...questionComments.documents.map((c) => databases.deleteDocument(db, commentCollection, c.$id)),
        ]);

        if (question.attachmentId && question.attachmentId !== "none") {
            try {
                await storage.deleteFile(questionAttachmentBucket, question.attachmentId);
            } catch {
                // File might already be gone, continue
            }
        }

        const netVotes = (docs: any[]) =>
            docs.filter((v) => v.voteStatus === "upvoted").length -
            docs.filter((v) => v.voteStatus === "downvoted").length;

        // Map of authorId -> total reputation they gained from things being
        // deleted here, so we subtract it exactly once per author even if
        // they wrote multiple answers.
        const toRemoveByAuthor = new Map<string, number>();

        // Question author loses net votes on the question
        const qNet = netVotes(questionVotes.documents);
        if (qNet !== 0) {
            toRemoveByAuthor.set(question.authorId as string, qNet);
        }

        // Answer authors lose the +1 for posting, plus any net votes on their answers
        for (const { answer, answerVotes } of perAnswerCleanup) {
            const aAuthor = answer.authorId as string;
            const aNet = netVotes(answerVotes.documents);
            const totalRepLoss = 1 + aNet; // +1 for posting, plus net votes

            const current = toRemoveByAuthor.get(aAuthor) ?? 0;
            toRemoveByAuthor.set(aAuthor, current + totalRepLoss);
        }

        const reputationAdjustments = Array.from(toRemoveByAuthor.entries()).map(([aId, amount]) => {
            return adjustReputation(aId, -amount).catch((err) => {
                console.error("[question/DELETE] reputation adjustment failed", { authorId: aId, amount, error: err });
            });
        });

        await Promise.all(reputationAdjustments);

        const response = await databases.deleteDocument(db, questionCollection, questionId);

        return NextResponse.json(
            { data: response, message: "Question deleted" },
            { status: 200 }
        );
    } catch (error: any) {
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error deleting question" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
