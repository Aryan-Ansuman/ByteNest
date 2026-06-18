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
import slugify from "@/utils/slugify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const VOTE_LIMIT = 5000;

const Page = async ({ params }: { params: { quesId: string; quesName: string } }) => {
    // ── Fetch the question, increment its view count, and kick off every
    // other independent fetch in parallel (including the author — issue #5). ──
    const existingQuestion = await databases.getDocument(db, questionCollection, params.quesId);
    const incrementedViews = Number(existingQuestion.views ?? 0) + 1;

    const tags = ((existingQuestion.tags as string[]) ?? []).filter(Boolean);

    const [question, author, answers, upvotes, downvotes, comments, similar] = await Promise.all([
        databases.updateDocument(db, questionCollection, params.quesId, {
            views: incrementedViews,
        }),
        users.get<UserPrefs>(existingQuestion.authorId),
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
        // Similar questions, by shared tags — only run if there are tags to match.
        tags.length > 0
            ? databases.listDocuments(db, questionCollection, [
                  Query.contains("tags", tags),
                  Query.notEqual("$id", params.quesId),
                  Query.orderDesc("$createdAt"),
                  Query.limit(3),
              ]).catch((e) => {
                  console.error("Failed to fetch similar questions:", e);
                  return { documents: [] as any[], total: 0 };
              })
            : Promise.resolve({ documents: [] as any[], total: 0 }),
    ]);

    // Issue #3: use the shared slugify utility so links match the rest of the app.
    const similarQuestions = similar.documents.map((q) => ({
        title: q.title as string,
        href: `/questions/${q.$id}/${slugify(q.title as string)}`,
        answers: (q as any).totalAnswers ?? 0,
    }));

    // ── Issue #4: collapse the N+1 avalanche. ──
    // Instead of, per answer: author fetch -> comments fetch -> per-comment author
    // fetch -> upvotes -> downvotes (each serialized inside a nested Promise.all),
    // batch by *kind* of fetch across all answers/comments at once, deduping
    // user lookups so the same author is never fetched twice.

    const answerIds = answers.documents.map((a) => a.$id);

    const [
        allAnswerComments,
        allAnswerUpvotes,
        allAnswerDownvotes,
    ] = await Promise.all([
        answerIds.length > 0
            ? databases.listDocuments(db, commentCollection, [
                  Query.equal("type", "answer"),
                  Query.equal("typeId", answerIds),
                  Query.orderDesc("$createdAt"),
                  Query.limit(5000),
              ])
            : Promise.resolve({ documents: [] as any[], total: 0 }),
        answerIds.length > 0
            ? databases.listDocuments(db, voteCollection, [
                  Query.equal("type", "answer"),
                  Query.equal("typeId", answerIds),
                  Query.equal("voteStatus", "upvoted"),
                  Query.limit(VOTE_LIMIT),
              ])
            : Promise.resolve({ documents: [] as any[], total: 0 }),
        answerIds.length > 0
            ? databases.listDocuments(db, voteCollection, [
                  Query.equal("type", "answer"),
                  Query.equal("typeId", answerIds),
                  Query.equal("voteStatus", "downvoted"),
                  Query.limit(VOTE_LIMIT),
              ])
            : Promise.resolve({ documents: [] as any[], total: 0 }),
    ]);

    // Group the batched results back per-answer.
    const commentsByAnswer = new Map<string, any[]>();
    for (const c of allAnswerComments.documents) {
        const list = commentsByAnswer.get(c.typeId as string) ?? [];
        list.push(c);
        commentsByAnswer.set(c.typeId as string, list);
    }
    const upvotesByAnswer = new Map<string, number>();
    for (const v of allAnswerUpvotes.documents) {
        upvotesByAnswer.set(v.typeId as string, (upvotesByAnswer.get(v.typeId as string) ?? 0) + 1);
    }
    const downvotesByAnswer = new Map<string, number>();
    for (const v of allAnswerDownvotes.documents) {
        downvotesByAnswer.set(v.typeId as string, (downvotesByAnswer.get(v.typeId as string) ?? 0) + 1);
    }

    // Collect every distinct author id we need — answer authors, answer-comment
    // authors, and question-comment authors — and fetch each ONCE.
    const authorIds = new Set<string>();
    answers.documents.forEach((a) => authorIds.add(a.authorId as string));
    allAnswerComments.documents.forEach((c) => authorIds.add(c.authorId as string));
    comments.documents.forEach((c) => authorIds.add(c.authorId as string));

    const authorEntries = await Promise.all(
        Array.from(authorIds).map(async (id) => {
            const u = await users.get<UserPrefs>(id).catch(() => null);
            return [id, u] as const;
        })
    );
    const authorById = new Map(authorEntries);

    const toAuthor = (id: string) => {
        const u = authorById.get(id);
        return {
            $id: u?.$id ?? "deleted",
            name: u?.name ?? "Deleted User",
            reputation: u?.prefs?.reputation ?? 0,
        };
    };

    // Hydrate question-level comments
    comments.documents = comments.documents.map((comment) => ({
        ...comment,
        author: toAuthor(comment.authorId as string),
    }));

    // Hydrate answers: author, comments (with their authors), and vote totals —
    // all from the maps built above, with zero additional API calls per answer.
    answers.documents = answers.documents.map((answer) => {
        const answerComments = (commentsByAnswer.get(answer.$id) ?? []).map((c) => ({
            ...c,
            author: toAuthor(c.authorId as string),
        }));

        return {
            ...answer,
            comments: { total: answerComments.length, documents: answerComments },
            upvotesDocuments: { total: upvotesByAnswer.get(answer.$id) ?? 0, documents: [] },
            downvotesDocuments: { total: downvotesByAnswer.get(answer.$id) ?? 0, documents: [] },
            author: toAuthor(answer.authorId as string),
        };
    });

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
