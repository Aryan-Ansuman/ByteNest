"use client";

import React from "react";
import dynamic from "next/dynamic";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { type AnswerSort, useQuestionDetail } from "./QuestionDetailContext";
import AnswerCard from "./AnswerCard";
import "@uiw/react-md-editor/markdown-editor.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

export default function ContentTabs({
    isLoadingDynamic = false,
    isLoadingMoreAnswers = false,
    onLoadMoreAnswers,
}: {
    isLoadingDynamic?: boolean;
    isLoadingMoreAnswers?: boolean;
    onLoadMoreAnswers?: () => void;
}) {
    const { answers, bestAnswer, communityAnswers } = useQuestionDetail();

    if (isLoadingDynamic) return <AnswersSkeleton />;

    return (
        <div className="mt-10">
            <AnswersTab
                bestAnswer={bestAnswer}
                communityAnswers={communityAnswers}
                total={answers.total}
                isLoadingMore={isLoadingMoreAnswers}
                onLoadMore={onLoadMoreAnswers}
            />
        </div>
    );
}

export function AnswersSkeleton() {
    return (
        <div className="mt-10 space-y-4" aria-busy="true" aria-label="Loading answers">
            <div className="flex items-center justify-between gap-4">
                <div className="h-5 w-28 animate-pulse rounded bg-white/[0.07]" />
                <div className="h-9 w-44 animate-pulse rounded-lg bg-white/[0.05]" />
            </div>
            {Array.from({ length: 2 }, (_, index) => (
                <div
                    key={index}
                    className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 sm:grid-cols-[48px_minmax(0,1fr)] sm:gap-5 sm:p-6"
                >
                    <div className="flex flex-col items-center gap-3 pt-2">
                        <div className="size-8 animate-pulse rounded-full bg-white/[0.07]" />
                        <div className="h-5 w-6 animate-pulse rounded bg-white/[0.07]" />
                        <div className="size-8 animate-pulse rounded-full bg-white/[0.07]" />
                    </div>
                    <div className="min-w-0 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="size-9 animate-pulse rounded-full bg-white/[0.07]" />
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

function AnswersTab({
    bestAnswer,
    communityAnswers,
    total,
    isLoadingMore,
    onLoadMore,
}: {
    bestAnswer: any;
    communityAnswers: any[];
    total: number;
    isLoadingMore: boolean;
    onLoadMore?: () => void;
}) {
    const {
        currentUser,
        openAnswerComposer,
        answerComposerOpen,
        closeAnswerComposer,
        submitAnswer,
        isDeletingQuestion,
        answerSort,
        setAnswerSort,
        answerPagination,
    } = useQuestionDetail();
    const [draft, setDraft] = React.useState("");
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isDeletingQuestion || !draft.trim()) return;
        setIsSubmitting(true);
        const posted = await submitAnswer(draft);
        setIsSubmitting(false);
        if (posted) {
            setDraft("");
            closeAnswerComposer();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-zinc-100">{total} Answers</h3>
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex h-9 overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
                        {(["Votes", "Active", "Oldest"] satisfies AnswerSort[]).map((sort) => (
                            <button
                                key={sort}
                                type="button"
                                onClick={() => setAnswerSort(sort)}
                                aria-pressed={answerSort === sort}
                                className={cn(
                                    "rounded-lg px-3 text-xs font-semibold transition",
                                    answerSort === sort
                                        ? "bg-[#CFE8D5] text-[#08100B]"
                                        : "text-zinc-500 hover:text-zinc-200"
                                )}
                            >
                                {sort}
                            </button>
                        ))}
                    </div>
                    {!answerComposerOpen && (
                        <button
                            onClick={openAnswerComposer}
                            disabled={isDeletingQuestion}
                            className="flex h-9 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Write an answer
                        </button>
                    )}
                </div>
            </div>

            {answerComposerOpen && (
                <form
                    onSubmit={handleSubmit}
                    className="rounded-xl border border-white/[0.08] bg-black/20 p-4"
                    aria-busy={isSubmitting || isDeletingQuestion}
                >
                    <p className="mb-2 text-xs font-medium text-zinc-500">
                        Posting as {currentUser?.name ?? "you"}
                    </p>
                    <div data-color-mode="dark">
                        <MDEditor
                            value={draft}
                            onChange={(value) => setDraft(value || "")}
                            height={280}
                            preview="live"
                            style={{
                                background: "transparent",
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: "12px",
                                overflow: "hidden",
                            }}
                            textareaProps={{
                                placeholder: "Write your answer... Markdown supported.",
                                disabled: isSubmitting || isDeletingQuestion,
                            }}
                        />
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={closeAnswerComposer}
                            disabled={isSubmitting || isDeletingQuestion}
                            className="h-9 rounded-xl border border-white/[0.08] px-3.5 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || isDeletingQuestion || !draft.trim()}
                            className="flex h-9 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-3.5 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                            {isSubmitting ? "Posting..." : "Post answer"}
                        </button>
                    </div>
                </form>
            )}

            <div className="space-y-6">
                {bestAnswer && <AnswerCard answer={bestAnswer} variant="best" />}
                {communityAnswers.map((answer) => (
                    <AnswerCard key={answer.$id} answer={answer} />
                ))}
                {answerPagination.hasMore && (
                    <div className="flex justify-center pt-2">
                        <button
                            type="button"
                            onClick={onLoadMore}
                            disabled={!onLoadMore || isLoadingMore || isDeletingQuestion}
                            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 text-sm font-semibold text-zinc-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isLoadingMore && <Loader2 className="size-3.5 animate-spin" />}
                            {isLoadingMore ? "Loading..." : "Load more answers"}
                        </button>
                    </div>
                )}
                {total === 0 && !answerComposerOpen && (
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-6 py-10 text-center">
                        <div className="mx-auto flex size-11 items-center justify-center rounded-full border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 text-[#CFE8D5]">
                            <MessageCircle className="size-5" />
                        </div>
                        <h4 className="mt-4 text-base font-semibold text-zinc-100">
                            No answers yet
                        </h4>
                        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">
                            Share what worked, explain the tradeoffs, or ask for one missing detail.
                        </p>
                        <button
                            type="button"
                            onClick={openAnswerComposer}
                            disabled={isDeletingQuestion}
                            className="mt-5 inline-flex h-9 items-center rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Write the first answer
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
