import { questionCollection, db, questionAttachmentBucket, answerCollection, voteCollection, commentCollection } from "@/models/name";
import { databases, storage, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";

export async function POST(request: NextRequest) {
    try {
        const { title, content, authorId, tags, attachmentId } = await request.json();

        const docData: any = {
            title,
            content,
            authorId,
            tags,
        };

        if (attachmentId) {
            docData.attachmentId = attachmentId;
        }

        const response = await databases.createDocument(
            db,
            questionCollection,
            ID.unique(),
            docData
        );

        return NextResponse.json(response, { status: 201 });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error creating question" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const { questionId, title, content, tags, attachmentId, oldAttachmentId } = await request.json();

        const docData: any = { title, content, tags };

        if (attachmentId && oldAttachmentId && oldAttachmentId !== attachmentId) {
            try {
                await storage.deleteFile(questionAttachmentBucket, oldAttachmentId);
            } catch {
                // Old file might not exist, continue
            }
            docData.attachmentId = attachmentId;
        } else if (attachmentId) {
            docData.attachmentId = attachmentId;
        }

        const response = await databases.updateDocument(
            db,
            questionCollection,
            questionId,
            docData
        );

        return NextResponse.json(response, { status: 200 });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error updating question" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { questionId, authorId } = await request.json();

        if (!questionId) {
            return NextResponse.json(
                { error: "questionId is required" },
                { status: 400 }
            );
        }

        const question = await databases.getDocument(db, questionCollection, questionId);

        // Only the original author may delete their question
        if (authorId && question.authorId !== authorId) {
            return NextResponse.json(
                { error: "You are not authorized to delete this question" },
                { status: 403 }
            );
        }

        // Fetch everything that hangs off this question so we can clean it up
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

        // For each answer, gather its own votes + comments so those get cleaned up too
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

        // Delete answer-level votes/comments, then the answers themselves
        await Promise.all(
            perAnswerCleanup.flatMap(({ answerVotes, answerComments }) => [
                ...answerVotes.documents.map((v) =>
                    databases.deleteDocument(db, voteCollection, v.$id)
                ),
                ...answerComments.documents.map((c) =>
                    databases.deleteDocument(db, commentCollection, c.$id)
                ),
            ])
        );

        await Promise.all(
            perAnswerCleanup.map(({ answer }) =>
                databases.deleteDocument(db, answerCollection, answer.$id)
            )
        );

        // Delete question-level votes and comments
        await Promise.all([
            ...questionVotes.documents.map((v) =>
                databases.deleteDocument(db, voteCollection, v.$id)
            ),
            ...questionComments.documents.map((c) =>
                databases.deleteDocument(db, commentCollection, c.$id)
            ),
        ]);

        // Delete the attachment file, if any
        if (question.attachmentId && question.attachmentId !== "none") {
            try {
                await storage.deleteFile(questionAttachmentBucket, question.attachmentId);
            } catch {
                // File might already be gone, continue
            }
        }

        // Adjust reputation: undo the +1 each answer author earned, and
        // any reputation the question author gained from votes on this question.
        const upvoteCount = questionVotes.documents.filter((v) => v.voteStatus === "upvoted").length;
        const downvoteCount = questionVotes.documents.filter((v) => v.voteStatus === "downvoted").length;
        const netQuestionReputation = upvoteCount - downvoteCount;

        const reputationAdjustments: Promise<any>[] = [];

        if (netQuestionReputation !== 0) {
            reputationAdjustments.push(
                (async () => {
                    const prefs = await users.getPrefs<UserPrefs>(question.authorId);
                    await users.updatePrefs<UserPrefs>(question.authorId, {
                        reputation: Number(prefs.reputation) - netQuestionReputation,
                    });
                })()
            );
        }

        const answerAuthorIds = Array.from(new Set(answers.documents.map((a) => a.authorId as string)));
        reputationAdjustments.push(
            ...answerAuthorIds.map(async (id) => {
                const prefs = await users.getPrefs<UserPrefs>(id);
                await users.updatePrefs<UserPrefs>(id, {
                    reputation: Number(prefs.reputation) - 1,
                });
            })
        );

        await Promise.all(reputationAdjustments);

        // Finally, delete the question itself
        const response = await databases.deleteDocument(db, questionCollection, questionId);

        return NextResponse.json(
            { data: response, message: "Question deleted" },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error deleting question" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
