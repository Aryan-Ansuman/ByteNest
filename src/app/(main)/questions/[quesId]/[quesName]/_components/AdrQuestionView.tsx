"use client";

import React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Bookmark } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { formatCount, useQuestionDetail } from "./QuestionDetailContext";
import CommentsSection from "./CommentsSection";
import MarkdownPreview from "@/components/MarkdownPreview";
import { Avatar, ConfirmDialog } from "./shared";
import { useAuthStore } from "@/store/Auth";
import ShareMenu from "./ShareMenu";
import { MoreMenu, formatQuestionVoteStatusForLabel } from "./QuestionHero";
import AdrRadarChart from "./AdrRadarChart";
import AdrScoreForm from "./AdrScoreForm";
import useSWR from "swr";
import { AdrDimension } from "@/models/name";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function AdrQuestionView() {
    const {
        question,
        author,
        questionTags,
        totalViews,
        questionVoteScore,
        getVoteStatus,
        isVotePending,
        voteQuestion,
        currentUser,
        deleteQuestion,
        isDeletingQuestion,
    } = useQuestionDetail();

    const userPrefs = useAuthStore((s) => s.user?.prefs);
    const toggleBookmarkStore = useAuthStore((s) => s.toggleBookmark);
    const bookmarked = userPrefs?.bookmarks?.includes(question.$id) ?? false;
    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

    const toggleBookmark = async () => {
        if (!currentUser) {
            toast.error("Please login to bookmark questions");
            return;
        }
        try {
            await toggleBookmarkStore(question.$id);
            toast.success(bookmarked ? "Bookmark removed" : "Question bookmarked");
        } catch {
            toast.error("Failed to update bookmark");
        }
    };

    const votedStatus = getVoteStatus("question", question.$id);
    const questionVotePending = isVotePending("question", question.$id);
    const isOwner = currentUser?.$id === question.authorId;

    // Fetch my submission dynamically
    const { data: adrData } = useSWR(
        currentUser ? `/api/adr?questionId=${question.$id}&limit=1` : null,
        fetcher
    );
    const mySubmission = adrData?.data?.mySubmission || null;

    const handleReport = () => {
        toast("Report submitted. Thanks for keeping ByteNest safe.");
    };

    const dimensions = React.useMemo(() => {
        try {
            return JSON.parse(question.adrDimensions || "[]") as AdrDimension[];
        } catch {
            return [];
        }
    }, [question.adrDimensions]);

    return (
        <>
            <article id="question" className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-3 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-5">
                {/* Left Column: Vote Rail */}
                <aside className="relative flex flex-col items-center pt-2">
                    <div className="flex shrink-0 flex-col items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] py-2 w-[44px]">
                        <button
                            onClick={() => voteQuestion("upvoted")}
                            disabled={isDeletingQuestion || questionVotePending}
                            aria-label="Upvote question"
                            className={cn(
                                "flex h-8 w-full items-center justify-center transition hover:text-orange-500 disabled:opacity-50",
                                votedStatus === "upvoted" ? "text-orange-500" : "text-zinc-500"
                            )}
                        >
                            <ArrowUp className="size-5" />
                        </button>
                        <span
                            className={cn(
                                "text-lg font-bold",
                                votedStatus === "upvoted" ? "text-orange-500" : votedStatus === "downvoted" ? "text-red-400" : "text-[#CFE8D5]"
                            )}
                        >
                            {questionVoteScore}
                        </span>
                        <button
                            onClick={() => voteQuestion("downvoted")}
                            disabled={isDeletingQuestion || questionVotePending}
                            aria-label="Downvote question"
                            className={cn(
                                "flex h-8 w-full items-center justify-center transition hover:text-red-400 disabled:opacity-50",
                                votedStatus === "downvoted" ? "text-red-400" : "text-zinc-500"
                            )}
                        >
                            <ArrowDown className="size-5" />
                        </button>
                    </div>

                    <div className="w-px h-3 bg-white/[0.08] shrink-0" />

                    <button
                        onClick={toggleBookmark}
                        disabled={isDeletingQuestion}
                        className={cn(
                            "flex shrink-0 size-10 items-center justify-center rounded-xl border transition-all",
                            bookmarked
                                ? "border-[#CFE8D5]/35 bg-[#CFE8D5]/10 text-[#CFE8D5]"
                                : "border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:text-zinc-200"
                        )}
                    >
                        <Bookmark className="size-4" fill={bookmarked ? "currentColor" : "none"} />
                    </button>
                </aside>

                {/* Right Column: Content */}
                <div className="min-w-0">
                    <header className="mt-1">
                        <div className="mb-3 inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-2.5 py-1 text-xs font-medium text-purple-400">
                            Architecture Decision Record (ADR)
                        </div>
                        <h1 className="text-2xl font-bold leading-snug tracking-tight text-zinc-100 sm:text-3xl">
                            {question.title}
                        </h1>

                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-zinc-400">
                            <span>Asked <span className="text-zinc-300">{convertDateToRelativeTime(new Date(question.$createdAt))}</span></span>
                            <span>Viewed <span className="text-zinc-300">{formatCount(totalViews)} times</span></span>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
                            <div className="flex flex-wrap items-center gap-2">
                                {questionTags.map((tag) => (
                                    <Link
                                        key={tag}
                                        href={`/questions?tag=${encodeURIComponent(tag)}`}
                                        className="inline-flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[13px] font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                                    >
                                        {tag}
                                    </Link>
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                <ShareMenu
                                    getUrl={() => window.location.href.split("#")[0]}
                                    title={question.title}
                                    text="Join the discussion on ByteNest."
                                    disabled={isDeletingQuestion}
                                />
                                <MoreMenu
                                    isOwner={isOwner}
                                    onDelete={() => setDeleteDialogOpen(true)}
                                    onReport={handleReport}
                                    disabled={isDeletingQuestion}
                                />
                            </div>
                        </div>
                    </header>

                    {/* Problem Statement (Content) */}
                    <div className="question-detail-markdown mt-5" data-color-mode="dark">
                        <MarkdownPreview source={String(question.content ?? "")} />
                    </div>

                    {/* ADR Options Comparison */}
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                        <div className="rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5]/5 p-5">
                            <h3 className="mb-2 text-lg font-semibold text-[#CFE8D5]">{question.optionA}</h3>
                            {question.optionADescription && (
                                <div className="prose prose-sm prose-invert max-w-none text-zinc-400">
                                    <MarkdownPreview source={question.optionADescription} />
                                </div>
                            )}
                        </div>
                        <div className="rounded-xl border border-[#D5CFE8]/20 bg-[#D5CFE8]/5 p-5">
                            <h3 className="mb-2 text-lg font-semibold text-[#D5CFE8]">{question.optionB}</h3>
                            {question.optionBDescription && (
                                <div className="prose prose-sm prose-invert max-w-none text-zinc-400">
                                    <MarkdownPreview source={question.optionBDescription} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Radar Chart */}
                    <div className="mt-8">
                        <AdrRadarChart
                            questionId={question.$id}
                            optionA={question.optionA || "Option A"}
                            optionB={question.optionB || "Option B"}
                            dimensions={dimensions}
                            mySubmission={mySubmission}
                            adrStatus={question.adrStatus}
                        />
                    </div>

                    {/* Score Form */}
                    <div className="mt-8">
                        <AdrScoreForm
                            questionId={question.$id}
                            optionA={question.optionA || "Option A"}
                            optionB={question.optionB || "Option B"}
                            dimensions={dimensions}
                            existingSubmission={mySubmission}
                        />
                    </div>

                    {/* Author row */}
                    <div className="mt-8 flex justify-end">
                        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] p-1.5 pr-4">
                            <Avatar name={author.name} />
                            <div className="flex flex-col">
                                <Link href={`/users/${author.$id}/${slugify(author.name)}`} className="text-[13px] font-medium text-[#CFE8D5] transition hover:text-white">
                                    {author.name}
                                </Link>
                                <span className="text-[11px] font-bold text-zinc-400">{formatCount(author.reputation)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Question-level comments */}
                    <div className="mt-6">
                        <CommentsSection type="question" typeId={question.$id} />
                    </div>
                </div>
            </article>

            <ConfirmDialog
                open={deleteDialogOpen}
                title="Delete this question?"
                description="This permanently removes the question, all its answers, votes, and comments. This cannot be undone."
                confirmLabel={isDeletingQuestion ? "Deleting…" : "Delete question"}
                destructive
                onCancel={() => setDeleteDialogOpen(false)}
                onConfirm={async () => {
                    await deleteQuestion();
                    setDeleteDialogOpen(false);
                }}
                busy={isDeletingQuestion}
            />
        </>
    );
}
