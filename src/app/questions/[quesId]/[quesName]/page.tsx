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
import QuestionDetail from "./QuestionDetail";

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
            Query.limit(1), // for optimization
        ]),
        databases.listDocuments(db, voteCollection, [
            Query.equal("typeId", params.quesId),
            Query.equal("type", "question"),
            Query.equal("voteStatus", "downvoted"),
            Query.limit(1), // for optimization
        ]),
        databases.listDocuments(db, commentCollection, [
            Query.equal("type", "question"),
            Query.equal("typeId", params.quesId),
            Query.orderDesc("$createdAt"),
        ]),
    ]);

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
                        Query.limit(1), // for optimization
                    ]),
                    databases.listDocuments(db, voteCollection, [
                        Query.equal("typeId", answer.$id),
                        Query.equal("type", "answer"),
                        Query.equal("voteStatus", "downvoted"),
                        Query.limit(1), // for optimization
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
        <QuestionDetail
            question={question}
            author={author}
            answers={answers as any}
            upvotes={upvotes}
            downvotes={downvotes}
            comments={comments as any}
            attachmentUrl={attachmentUrl}
        />
    );
};

export default Page;
