/**
 * Question Detail Page — Caching Architecture
 * ─────────────────────────────────────────────
 * Static shell (ISR, revalidates every hour):
 *   - question title, body, tags, author, attachment, similar questions
 *
 * Dynamic content (streamed via Suspense, fetched client-side):
 *   - vote counts          → QuestionDetailContext (polls /api/vote)
 *   - answers + their votes/comments → fetched in DynamicAnswers
 *   - question-level comments        → fetched in DynamicComments
 *   - view-count increment           → fire-and-forget, unblocked
 *
 * Why this split?
 *   The question body almost never changes after the first few minutes.
 *   Votes, new answers, and comments can arrive any time, but users
 *   tolerate a brief client-side loading spinner for them — they do NOT
 *   tolerate waiting for a full SSR round-trip on every page view just to
 *   confirm the vote count they already saw.
 */

import { answerCollection, db, questionCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { Query } from "node-appwrite";
import { notFound } from "next/navigation";
import React from "react";
import QuestionStaticShell from "./_components/QuestionStaticShell";
import slugify from "@/utils/slugify";

// ─── Caching strategy ────────────────────────────────────────────────────────
// The static shell (question body, author, similar questions) is ISR-cached
// for 1 hour. Votes/answers/comments are fetched dynamically on the client.
export const revalidate = 3600; // 1 hour ISR for the static shell

export const dynamic = "auto";

const Page = async ({ params }: { params: { quesId: string; quesName: string } }) => {
    // ── 1. Fetch the static question document ────────────────────────────
    // This fetch is cached by Next.js for `revalidate` seconds.
    let question;
    try {
        question = await databases.getDocument(db, questionCollection, params.quesId);
    } catch {
        notFound();
    }

    const tags = ((question.tags as string[]) ?? []).filter(Boolean);

    // ── 2. Parallel static fetches (all ISR-cached) ──────────────────────
    // author + similar questions are rarely-changing — safe to cache.
    const [author, similar, answerCount] = await Promise.all([
        users.get<UserPrefs>(question.authorId),
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
                      return res.documents
                          .map((q) => ({
                              doc: q,
                              overlap: ((q.tags as string[]) ?? []).filter((t) => tagSet.has(t)).length,
                          }))
                          .sort((a, b) => b.overlap - a.overlap)
                          .slice(0, 3)
                          .map(({ doc }) => doc);
                  })
                  .catch(() => [] as any[])
            : Promise.resolve([] as any[]),
        databases.listDocuments(db, answerCollection, [
            Query.equal("questionId", params.quesId),
            Query.limit(1),
        ]),
    ]);

    const similarQuestions = similar.map((q) => ({
        title: q.title as string,
        href: `/questions/${q.$id}/${slugify(q.title as string)}`,
        answers: (q as any).totalAnswers ?? 0,
    }));

    // ── 3. Serialize only what the static shell needs ────────────────────
    const staticProps = {
        question: {
            $id: question.$id,
            $createdAt: question.$createdAt,
            $updatedAt: question.$updatedAt,
            title: question.title as string,
            content: question.content as string,
            authorId: question.authorId as string,
            tags,
            attachmentId: (question.attachmentId as string) ?? null,
            acceptedAnswerId: (question.acceptedAnswerId as string | undefined) ?? null,
            views: Number(question.views ?? 0),
            // Pass the denormalized total so the client shows a number immediately
            // without waiting for the vote API response.
            totalVotes: Number(question.totalVotes ?? 0),
            totalAnswers: Number(answerCount.total ?? 0),
        },
        author: {
            $id: author.$id,
            name: author.name,
            reputation: author.prefs?.reputation ?? 0,
        },
        attachmentUrl:
            question.attachmentId && question.attachmentId !== "none"
                ? `/api/question-attachment/${encodeURIComponent(question.attachmentId as string)}`
                : "",
        similarQuestions,
    };

    return (
        /*
         * QuestionStaticShell renders the question body immediately from ISR cache.
         * Inside it, DynamicAnswers and DynamicVotes are wrapped in <Suspense>
         * and fetch from /api/* on the client, so they never block the static paint.
         */
        <QuestionStaticShell {...staticProps} />
    );
};

export default Page;
