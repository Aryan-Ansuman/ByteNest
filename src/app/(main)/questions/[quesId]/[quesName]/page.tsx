import {
    answerCollection,
    db,
    voteCollection,
    questionCollection,
    commentCollection,
    questionAttachmentBucket,
} from "@/models/name";
import { databases, users } from "@/models/server/config";
import { storage } from "@/models/client/config";
import { UserPrefs } from "@/store/Auth";
import { Query } from "node-appwrite";
import React from "react";
import QuestionDetailPage from "./_components/QuestionDetailPage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Maximum votes we ever expect on a single item.
// Appwrite's `total` field is accurate regardless of `limit`,
// but using a realistic ceiling makes the intent explicit and
// keeps the code correct if that behaviour ever changes.
const VOTE_LIMIT = 5000;

const Page = async ({ params }: { params: { quesId: string; quesName: string } }) => {
    const [question, answers, upvotes, downvotes, comments] = await Promise.all([
        databases.getDocument(db, questionCollection, params.quesId),
        databases.listDocuments(db, answerCollection, [
            Query.orderDesc("$createdAt"),
            Query.equal("questionId", params.quesId),
        ]),
        databases.listDocuments(db, voteCollection, [
            Query.equal("typeId", params.quesId),
            Query.equal("type", "question"),
            Query.equal("voteStatus", "upvoted"),
            Query.limit(VOTE_LIMIT),
        ]),
        databases.listDocuments(db, voteCollection, [
            Query.equal("typeId", params.quesId),
            Query.equal("type", "question"),
            Query.equal("voteStatus", "downvoted"),
            Query.limit(VOTE_LIMIT),
        ]),
        databases.listDocuments(db, commentCollection, [
            Query.equal("type", "question"),
            Query.equal("typeId", params.quesId),
            Query.orderDesc("$createdAt"),
        ]),
    ]);

    // Fetch similar questions based on tags
    let similarQuestions: any[] = [];
    const tags = question.tags || [];
    if (tags.length > 0) {
        try {
            const similar = await databases.listDocuments(db, questionCollection, [
                Query.contains("tags", tags),
                Query.notEqual("$id", params.quesId),
                Query.orderDesc("$createdAt"),
                Query.limit(3)
            ]);
            similarQuestions = similar.documents.map(q => ({
                title: q.title,
                href: `/questions/${q.$id}/${q.title.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()}`,
                answers: q.totalAnswers || 0
            }));
        } catch (e) {
            console.error("Failed to fetch similar questions:", e);
        }
    }

    // since it is dependent on the question, we fetch it here outside of the Promise.all
    const author = await users.get<UserPrefs>(question.authorId);
    [comments.documents, answers.documents] = await Promise.all([
        Promise.all(
            comments.documents.map(async comment => {
                const author = await users.get<UserPrefs>(comment.authorId);
                return {
                    ...comment,
                    author: {
                        $id: author.$id,
                        name: author.name,
                        reputation: author.prefs.reputation,
                    },
                };
            })
        ),
        Promise.all(
            answers.documents.map(async answer => {
                const [author, answerComments, answerUpvotes, answerDownvotes] = await Promise.all([
                    users.get<UserPrefs>(answer.authorId),
                    databases.listDocuments(db, commentCollection, [
                        Query.equal("typeId", answer.$id),
                        Query.equal("type", "answer"),
                        Query.orderDesc("$createdAt"),
                    ]),
                    databases.listDocuments(db, voteCollection, [
                        Query.equal("typeId", answer.$id),
                        Query.equal("type", "answer"),
                        Query.equal("voteStatus", "upvoted"),
                        Query.limit(VOTE_LIMIT),
                    ]),
                    databases.listDocuments(db, voteCollection, [
                        Query.equal("typeId", answer.$id),
                        Query.equal("type", "answer"),
                        Query.equal("voteStatus", "downvoted"),
                        Query.limit(VOTE_LIMIT),
                    ]),
                ]);

                answerComments.documents = await Promise.all(
                    answerComments.documents.map(async comment => {
                        const author = await users.get<UserPrefs>(comment.authorId);
                        return {
                            ...comment,
                            author: {
                                $id: author.$id,
                                name: author.name,
                                reputation: author.prefs.reputation,
                            },
                        };
                    })
                );

                return {
                    ...answer,
                    comments: answerComments,
                    upvotesDocuments: answerUpvotes,
                    downvotesDocuments: answerDownvotes,
                    author: {
                        $id: author.$id,
                        name: author.name,
                        reputation: author.prefs.reputation,
                    },
                };
            })
        ),
    ]);

    const attachmentUrl = question.attachmentId && question.attachmentId !== "none"
        ? storage.getFilePreview(questionAttachmentBucket, question.attachmentId).href
        : "";

    return (
        <QuestionDetailPage
            question={question}
            author={author}
            answers={answers as any}
            upvotes={upvotes}
            downvotes={downvotes}
            comments={comments as any}
            attachmentUrl={attachmentUrl}
            similarQuestions={similarQuestions}
        />
    );
};

export default Page;
