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
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import React from "react";
import QuestionDetailPage from "./_components/QuestionDetailPage";
import slugify from "@/utils/slugify";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BOT_USER_AGENT_PATTERN =
    /bot|crawler|spider|slurp|facebookexternalhit|whatsapp|slackbot|twitterbot|discordbot|telegrambot|linkedinbot|embedly|quora link preview|pinterest|vkshare|w3c_validator|baiduspider|yandexbot|duckduckbot|ahrefsbot|semrushbot|mj12bot|petalbot|skypeuripreview|redditbot|applebot/i;

const Page = async ({ params }: { params: { quesId: string; quesName: string } }) => {
    // ── 1. Fetch question — 404 cleanly on missing/deleted documents ──────
    let existingQuestion;
    try {
        existingQuestion = await databases.getDocument(db, questionCollection, params.quesId);
    } catch {
        notFound();
    }

    // ── 2. View-count dedup ───────────────────────────────────────────────
    const cookieStore = cookies();
    const viewCookieName = `bn_viewed_${params.quesId}`;
    const alreadyViewedThisSession = cookieStore.get(viewCookieName)?.value === "1";
    const userAgent = headers().get("user-agent") ?? "";
    const isBot = BOT_USER_AGENT_PATTERN.test(userAgent);
    const shouldIncrementView = !alreadyViewedThisSession && !isBot;

    // Fire-and-forget — never blocks rendering or takes down the page.
    if (shouldIncrementView) {
        databases
            .updateDocument(db, questionCollection, params.quesId, {
                views: Number(existingQuestion.views ?? 0) + 1,
            })
            .catch((err) => {
                console.error("[view-increment] failed:", err?.message ?? err);
            });
    }

    const question = existingQuestion;
    const tags = ((question.tags as string[]) ?? []).filter(Boolean);

    // ── 3. Parallel data fetches ──────────────────────────────────────────
    // Vote totals are now read directly from the denormalized `totalVotes`
    // field on the document — no vote-document listing needed here at all.
    const questionVoteScore = Number(question.totalVotes ?? 0);

    const [author, answers, comments, similar] = await Promise.all([
        users.get<UserPrefs>(question.authorId),
        databases.listDocuments(db, answerCollection, [
            Query.orderDesc("$createdAt"),
            Query.equal("questionId", params.quesId),
        ]),
        databases.listDocuments(db, commentCollection, [
            Query.equal("type", "question"),
            Query.equal("typeId", params.quesId),
            Query.orderDesc("$createdAt"),
        ]),
        tags.length > 0
            ? databases
                  .listDocuments(db, questionCollection, [
                      Query.contains("tags", tags),
                      Query.notEqual("$id", params.quesId),
                      Query.orderDesc("$createdAt"),
                      Query.limit(10),
                  ])
                  .then((res) => {
                      const tagSet = new Set(tags);
                      return {
                          ...res,
                          documents: res.documents
                              .map((q) => ({
                                  doc: q,
                                  overlap: ((q.tags as string[]) ?? []).filter((t) =>
                                      tagSet.has(t)
                                  ).length,
                              }))
                              .sort((a, b) => b.overlap - a.overlap)
                              .slice(0, 3)
                              .map(({ doc }) => doc),
                      };
                  })
                  .catch((err) => {
                      console.error("[similar-questions] failed:", err?.message ?? err);
                      return { documents: [] as any[], total: 0 };
                  })
            : Promise.resolve({ documents: [] as any[], total: 0 }),
    ]);

    const similarQuestions = (similar as { documents: any[] }).documents.map((q) => ({
        title: q.title as string,
        href: `/questions/${q.$id}/${slugify(q.title as string)}`,
        answers: (q as any).totalAnswers ?? 0,
    }));

    // ── 4. Batch per-answer sub-fetches ───────────────────────────────────
    const answerIds = answers.documents.map((a) => a.$id);

    const [allAnswerComments] = await Promise.all([
        answerIds.length > 0
            ? databases.listDocuments(db, commentCollection, [
                  Query.equal("type", "answer"),
                  Query.equal("typeId", answerIds),
                  Query.orderDesc("$createdAt"),
                  Query.limit(5000),
              ])
            : Promise.resolve({ documents: [] as any[], total: 0 }),
        // No vote document listing — answer vote totals come from
        // the denormalized `totalVotes` field on each answer document.
    ]);

    const commentsByAnswer = new Map<string, any[]>();
    for (const c of (allAnswerComments as { documents: any[] }).documents) {
        const list = commentsByAnswer.get(c.typeId as string) ?? [];
        list.push(c);
        commentsByAnswer.set(c.typeId as string, list);
    }

    // ── 5. Deduplicated user fetches ──────────────────────────────────────
    const authorIds = new Set<string>();
    authorIds.add(question.authorId as string);
    answers.documents.forEach((a) => authorIds.add(a.authorId as string));
    (allAnswerComments as { documents: any[] }).documents.forEach((c) =>
        authorIds.add(c.authorId as string)
    );
    comments.documents.forEach((c) => authorIds.add(c.authorId as string));

    const authorEntries = await Promise.all(
        Array.from(authorIds).map(async (id) => {
            if (id === question.authorId) return [id, author] as const;
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

    // ── 6. Hydrate documents ──────────────────────────────────────────────
    comments.documents = comments.documents.map((comment) => ({
        ...comment,
        author: toAuthor(comment.authorId as string),
    }));

    answers.documents = answers.documents.map((answer) => {
        const answerComments = (commentsByAnswer.get(answer.$id) ?? []).map((c) => ({
            ...c,
            author: toAuthor(c.authorId as string),
        }));

        // Read the denormalized counter; fall back to 0 for answers
        // created before the migration.
        const answerVoteScore = Number(answer.totalVotes ?? 0);

        return {
            ...answer,
            comments: { total: answerComments.length, documents: answerComments },
            // Synthetic DocumentList shapes the Provider expects, encoding
            // the pre-computed total so the client renders the correct
            // score immediately without listing any vote documents.
            upvotesDocuments: {
                total: answerVoteScore >= 0 ? answerVoteScore : 0,
                documents: [],
            },
            downvotesDocuments: {
                total: answerVoteScore < 0 ? Math.abs(answerVoteScore) : 0,
                documents: [],
            },
            author: toAuthor(answer.authorId as string),
        };
    });

    // Synthetic upvotes/downvotes for the question — the Provider computes
    // `questionVoteScore = upvotes.total - downvotes.total`, so we encode
    // the denormalized total as a net-positive or net-negative split.
    const syntheticUpvotes = {
        total: questionVoteScore >= 0 ? questionVoteScore : 0,
        documents: [],
    };
    const syntheticDownvotes = {
        total: questionVoteScore < 0 ? Math.abs(questionVoteScore) : 0,
        documents: [],
    };

    const attachmentUrl =
        question.attachmentId && question.attachmentId !== "none"
            ? storage.getFilePreview(questionAttachmentBucket, question.attachmentId).href
            : "";

    return (
        <>
            {shouldIncrementView && (
                <script
                    suppressHydrationWarning
                    dangerouslySetInnerHTML={{
                        __html: `document.cookie = "${viewCookieName}=1; path=/; max-age=86400; samesite=lax";`,
                    }}
                />
            )}
            <QuestionDetailPage
                question={question}
                author={author}
                answers={answers as any}
                upvotes={syntheticUpvotes as any}
                downvotes={syntheticDownvotes as any}
                comments={comments as any}
                attachmentUrl={attachmentUrl}
                similarQuestions={similarQuestions}
            />
        </>
    );
};

export default Page;
