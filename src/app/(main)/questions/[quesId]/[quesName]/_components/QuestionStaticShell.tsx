"use client";

/**
 * QuestionStaticShell
 * ─────────────────────
 * Client component that:
 *  1. Renders the static question body immediately (from ISR props).
 *  2. Wraps the dynamic islands (votes, answers, comments) in <Suspense>
 *     so they stream in without blocking the initial paint.
 *
 * Why "use client" on the shell?
 *   QuestionDetailProvider is already a client context (it manages vote
 *   optimistic state, answer composer open/close, etc.). The static shell
 *   owns the Provider so it can pass the initial vote score down immediately
 *   from ISR data, then let the client-side fetches update it.
 *
 * Data flow:
 *   page.tsx (ISR, 1hr cache)
 *     └── QuestionStaticShell  ← you are here
 *           ├── QuestionDetailProvider  (initializes from ISR props)
 *           ├── QuestionHero            (static: body, tags, author)
 *           │     └── DynamicComments   <Suspense> → GET /api/comment
 *           └── DynamicAnswerSection    <Suspense> → GET /api/answers-for-question
 *                     └── QuestionSidebar (static: similar Qs, activity stats)
 */

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useAuthStore } from "@/store/Auth";
import { formatCollectiveName, QuestionDetailProvider } from "./QuestionDetailContext";
import QuestionHero from "./QuestionHero";
import QuestionSidebar from "./QuestionSidebar";
import DynamicAnswerSection from "./DynamicAnswerSection";
import ErrorBoundary from "@/components/ErrorBoundary";

interface StaticQuestion {
    $id: string;
    $createdAt: string;
    $updatedAt: string;
    title: string;
    content: string;
    authorId: string;
    tags: string[];
    attachmentId: string | null;
    acceptedAnswerId: string | null;
    views: number;
    totalVotes: number;
    totalAnswers: number;
}

interface StaticAuthor {
    $id: string;
    name: string;
    reputation: number;
}

interface SimilarQuestion {
    title: string;
    href: string;
    answers: number;
}

interface Props {
    question: StaticQuestion;
    author: StaticAuthor;
    attachmentUrl: string;
    similarQuestions: SimilarQuestion[];
}

export default function QuestionStaticShell({
    question,
    author,
    attachmentUrl,
    similarQuestions,
}: Props) {
    const { user } = useAuthStore();

    const breadcrumbTag = question.tags[0] ?? "";
    const breadcrumbLabel = breadcrumbTag ? formatCollectiveName(breadcrumbTag) : "Uncategorized";

    return (
        <QuestionDetailProvider
            question={question as any}
            author={author as any}
            currentUser={user as any}
            // Answers and comments start empty — DynamicAnswerSection fetches them.
            // Vote totals now come from denormalized totalVotes, not a fabricated split.
            answers={{ total: 0, documents: [] }}
            upvotes={{ total: 0, documents: [] } as any}
            downvotes={{ total: 0, documents: [] } as any}
            comments={{ total: 0, documents: [] }}
            attachmentUrl={attachmentUrl}
            similarQuestions={similarQuestions}
        >
            <QuestionViewTracker questionId={question.$id} />
            <div className="relative mx-auto w-full max-w-[1420px] pb-20">
                {/* Ambient glow */}
                <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[500px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(207,232,213,0.08),transparent)]" />

                {/* Breadcrumbs */}
                <div className="mb-7 flex items-center gap-2 text-sm text-zinc-500">
                    <Link href="/questions" className="transition-colors hover:text-zinc-200">
                        All Questions
                    </Link>
                    <ChevronRight className="size-3.5" />
                    {breadcrumbTag ? (
                        <Link
                            href={`/questions?tag=${encodeURIComponent(breadcrumbTag)}`}
                            className="transition-colors hover:text-zinc-200"
                        >
                            {breadcrumbLabel}
                        </Link>
                    ) : (
                        <span className="text-zinc-500">{breadcrumbLabel}</span>
                    )}
                    <ChevronRight className="size-3.5" />
                    <span className="truncate text-zinc-400">{question.title}</span>
                </div>

                {/* Two-column grid */}
                <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
                    <main className="min-w-0 space-y-5">
                        {/* Static: question body, tags, author block, attachment */}
                        <QuestionHero />

                        {/*
                         * Dynamic island: answers + answer composer.
                         * Suspense boundary shows a skeleton while the client
                         * fetches answers from the server.
                         */}
                        <React.Suspense fallback={<AnswersSkeleton expectedAnswerCount={question.totalAnswers} />}>
                            <ErrorBoundary>
                                <DynamicAnswerSection questionId={question.$id} />
                            </ErrorBoundary>
                        </React.Suspense>
                    </main>

                    {/* Sidebar: similar questions (ISR-static) + live activity stats */}
                    <QuestionSidebar />
                </div>
            </div>
        </QuestionDetailProvider>
    );
}

const trackedQuestionViews = new Set<string>();

function QuestionViewTracker({ questionId }: { questionId: string }) {
    React.useEffect(() => {
        if (trackedQuestionViews.has(questionId)) return;
        trackedQuestionViews.add(questionId);

        fetch("/api/question-view", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questionId }),
            keepalive: true,
        }).catch(() => {
            trackedQuestionViews.delete(questionId);
        });
    }, [questionId]);

    return null;
}

// ─── Skeleton shown while answers load ───────────────────────────────────────

function AnswersSkeleton({ expectedAnswerCount }: { expectedAnswerCount: number }) {
    const placeholderCount = Math.min(Math.max(expectedAnswerCount, 0), 5);

    return (
        <div className="mt-10 space-y-4" aria-busy="true" aria-label="Loading answers…">
            {/* Tab bar placeholder */}
            <div className="flex items-center gap-6 border-b border-white/[0.08] pb-3">
                {["AI Answer", "Answers", "Discussion"].map((label) => (
                    <div key={label} className="h-4 w-20 animate-pulse rounded-full bg-white/[0.07]" />
                ))}
            </div>
            <p className="text-xs text-zinc-600">
                {expectedAnswerCount > 0
                    ? `Loading ${expectedAnswerCount} answer${expectedAnswerCount !== 1 ? "s" : ""}...`
                    : "Checking for answers..."}
            </p>
            {/* Answer card placeholders */}
            {Array.from({ length: placeholderCount }, (_, i) => i + 1).map((i) => (
                <div
                    key={i}
                    className="grid grid-cols-[56px_minmax(0,1fr)] gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-6"
                >
                    {/* Vote rail */}
                    <div className="flex flex-col items-center gap-3 pt-2">
                        <div className="h-8 w-8 animate-pulse rounded-full bg-white/[0.07]" />
                        <div className="h-5 w-6 animate-pulse rounded bg-white/[0.07]" />
                        <div className="h-8 w-8 animate-pulse rounded-full bg-white/[0.07]" />
                    </div>
                    {/* Content */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="size-10 animate-pulse rounded-full bg-white/[0.07]" />
                            <div className="space-y-1.5">
                                <div className="h-3.5 w-28 animate-pulse rounded bg-white/[0.07]" />
                                <div className="h-3 w-20 animate-pulse rounded bg-white/[0.05]" />
                            </div>
                        </div>
                        <div className="space-y-2 pt-2">
                            <div className="h-3.5 w-full animate-pulse rounded bg-white/[0.06]" />
                            <div className="h-3.5 w-5/6 animate-pulse rounded bg-white/[0.06]" />
                            <div className="h-3.5 w-4/6 animate-pulse rounded bg-white/[0.05]" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
