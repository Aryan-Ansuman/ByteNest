"use client";

import React from "react";
import Link from "next/link";
import {
    ArrowDown,
    ArrowUp,
    Bookmark,
    ExternalLink,
    GitMerge,
    GitPullRequest,
    XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { apiFetch } from "@/lib/api-fetch";
import { formatCount, useQuestionDetail, type AnswerDoc } from "./QuestionDetailContext";
import CommentsSection from "./CommentsSection";
import MarkdownPreview from "@/components/MarkdownPreview";
import { Avatar, ConfirmDialog } from "./shared";
import { useAuthStore } from "@/store/Auth";
import ShareMenu from "./ShareMenu";
import { MoreMenu, formatQuestionVoteStatusForLabel } from "./QuestionHero";
import PrDiffViewer, { useSelectedDiffLineFromHash } from "./PrDiffViewer";
import PrStatusBanner from "./PrStatusBanner";
import RefreshStatusButton from "./RefreshStatusButton";
import OrphanedAnswersSection from "./OrphanedAnswersSection";
import { partitionAnswersByDiffState } from "@/lib/pr-questions/diffOrphan";
import { isPrDiffReadOnly } from "@/lib/pr-questions/readOnly";
import { RefreshCw, AlertTriangle } from "lucide-react";

const PR_STATUS_META: Record<
    "open" | "merged" | "closed",
    { label: string; className: string; icon: React.ReactNode }
> = {
    open: {
        label: "Open",
        className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        icon: <GitPullRequest className="size-3.5" />,
    },
    merged: {
        label: "Merged",
        className: "border-purple-500/30 bg-purple-500/10 text-purple-400",
        icon: <GitMerge className="size-3.5" />,
    },
    closed: {
        label: "Closed",
        className: "border-red-500/30 bg-red-500/10 text-red-400",
        icon: <XCircle className="size-3.5" />,
    },
};

export default function PrQuestionView() {
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
        answers,
    } = useQuestionDetail();

    const [selectedLine, setSelectedLine] = useSelectedDiffLineFromHash();
    const [parsedDiffFiles, setParsedDiffFiles] = React.useState<any[] | null>(null);

    const { anchored, orphaned, general } = React.useMemo(() => {
        const docs = (answers?.documents || []) as (AnswerDoc & { diffLineRef: string | null })[];
        if (!parsedDiffFiles) return { anchored: [], orphaned: [], general: docs };
        return partitionAnswersByDiffState(docs, parsedDiffFiles);
    }, [answers, parsedDiffFiles]);

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

    const repoOwner = question.prRepoOwner ?? "";
    const repoName = question.prRepoName ?? "";
    const prNumber = question.prNumber ?? null;
    const repoHref = repoOwner && repoName ? `https://github.com/${repoOwner}/${repoName}` : "#";
    const prHref = repoHref !== "#" && prNumber ? `${repoHref}/pull/${prNumber}` : repoHref;
    const lastActivityAt = question.activityAt ?? question.$updatedAt;

    // ── Phase 7: auto-sync status + manual "Refresh Status" fallback ──
    const [webhookRegistrationStatus, setWebhookRegistrationStatus] = React.useState<
        "registered" | "failed_no_permission" | "unregistered" | null
    >(null);
    const [statusOverride, setStatusOverride] = React.useState<{ prStatus: "open" | "merged" | "closed" } | null>(null);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const effectiveStatusMeta = PR_STATUS_META[statusOverride?.prStatus ?? question.prStatus ?? "open"];

    React.useEffect(() => {
        let cancelled = false;
        apiFetch<{ data: { webhookRegistrationStatus: "registered" | "failed_no_permission" | "unregistered" } }>(
            `/api/pr-question/${question.$id}/status`
        )
            .then((res) => {
                if (!cancelled) setWebhookRegistrationStatus(res.data.webhookRegistrationStatus);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [question.$id]);

    // ── Phase 8 manual "Refresh Status" fallback ──
    const handleRefreshed = (result: any) => {
        setStatusOverride({ prStatus: result.prStatus });
    };

    const handleReport = () => {
        toast("Report submitted. Thanks for keeping ByteNest safe.");
    };

    return (
        <>
            <article id="question" className="relative grid grid-cols-[44px_minmax(0,1fr)] gap-3 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-5">
                {/* Left Column: Vote Rail — identical to QuestionHero, votes work unchanged (Phase 9) */}
                <aside className="relative flex flex-col items-center pt-2">
                    <div className="flex shrink-0 flex-col items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] py-2 w-[44px]">
                        <button
                            onClick={() => voteQuestion("upvoted")}
                            disabled={isDeletingQuestion || questionVotePending}
                            aria-busy={questionVotePending}
                            aria-label={`Upvote question. Current score ${questionVoteScore}. ${formatQuestionVoteStatusForLabel(votedStatus)}.`}
                            aria-pressed={votedStatus === "upvoted"}
                            className={cn(
                                "flex h-8 w-full items-center justify-center transition hover:text-orange-500 disabled:cursor-not-allowed disabled:opacity-50",
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
                            aria-busy={questionVotePending}
                            aria-label={`Downvote question. Current score ${questionVoteScore}. ${formatQuestionVoteStatusForLabel(votedStatus)}.`}
                            aria-pressed={votedStatus === "downvoted"}
                            className={cn(
                                "flex h-8 w-full items-center justify-center transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50",
                                votedStatus === "downvoted" ? "text-red-400" : "text-zinc-500"
                            )}
                        >
                            <ArrowDown className="size-5" />
                        </button>
                    </div>

                    <div className="w-px h-3 bg-white/[0.08] shrink-0" />

                    <button
                        onClick={toggleBookmark}
                        aria-label={bookmarked ? "Remove bookmark" : "Bookmark question"}
                        aria-pressed={bookmarked}
                        disabled={isDeletingQuestion}
                        className={cn(
                            "flex shrink-0 size-10 items-center justify-center rounded-xl border transition-all disabled:cursor-not-allowed disabled:opacity-50",
                            bookmarked
                                ? "border-[#CFE8D5]/35 bg-[#CFE8D5]/10 text-[#CFE8D5]"
                                : "border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/15 hover:text-zinc-200"
                        )}
                    >
                        <Bookmark className="size-4" fill={bookmarked ? "currentColor" : "none"} />
                    </button>
                </aside>

                {/* Right Column: Content */}
                <div className="min-w-0">
                    {/* ── PR Metadata Card ── */}
                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <a
                                    href={prHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group inline-flex items-start gap-1.5 text-lg font-semibold leading-snug text-zinc-100 transition hover:text-[#a7c8b3] sm:text-xl"
                                >
                                    {question.prTitle || "Untitled pull request"}
                                    <ExternalLink className="mt-1 size-3.5 shrink-0 text-zinc-500 opacity-0 transition group-hover:opacity-100" />
                                </a>
                                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-zinc-500">
                                    <a href={repoHref} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300">
                                        {repoOwner}/{repoName}
                                    </a>
                                    {prNumber ? <span>#{prNumber}</span> : null}
                                    {question.prAuthorGithubHandle ? (
                                        <span>
                                            by{" "}
                                            <a
                                                href={`https://github.com/${question.prAuthorGithubHandle}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="hover:text-zinc-300"
                                            >
                                                @{question.prAuthorGithubHandle}
                                            </a>
                                        </span>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                                <span className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", effectiveStatusMeta.className)}>
                                    {effectiveStatusMeta.icon}
                                    {effectiveStatusMeta.label}
                                </span>
                                <RefreshStatusButton questionId={question.$id} onRefreshed={handleRefreshed} />
                            </div>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
                            {question.prHeadRef && question.prBaseRef ? (
                                <div className="flex items-center gap-1.5">
                                    <code className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-400">{question.prHeadRef}</code>
                                    <span>→</span>
                                    <code className="rounded bg-white/5 px-1.5 py-0.5 text-zinc-400">{question.prBaseRef}</code>
                                </div>
                            ) : null}
                            {lastActivityAt ? (
                                <span>
                                    Active{" "}
                                    <span className="text-zinc-400">{convertDateToRelativeTime(new Date(lastActivityAt))}</span>
                                </span>
                            ) : null}
                        </div>
                    </div>

                    {/* ── Question title + controls ── */}
                    <header className="mt-6">
                        <h1 className="text-2xl font-bold leading-snug tracking-tight text-zinc-100 sm:text-3xl">{question.title}</h1>

                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-zinc-400">
                            <span>
                                Asked <span className="text-zinc-300">{convertDateToRelativeTime(new Date(question.$createdAt))}</span>
                            </span>
                            <span>
                                Viewed <span className="text-zinc-300">{formatCount(totalViews)} times</span>
                            </span>
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

                    {/* ── The user's actual question (what they're asking about the PR) ── */}
                    <div className="question-detail-markdown mt-5" data-color-mode="dark" role="region" aria-label="Question body">
                        <MarkdownPreview source={String(question.content ?? "")} />
                    </div>

                    {/* ── Diff Viewer ── */}
                    <div className="mt-6">
                        <PrStatusBanner question={question as any} />
                        <PrDiffViewer
                            questionId={question.$id}
                            diffFileId={question.diffFileId ?? null}
                            selectedLine={selectedLine}
                            onSelectLine={isPrDiffReadOnly(question as any) ? () => {} : setSelectedLine}
                            lineAnchoredAnswers={anchored as AnswerDoc[]}
                            onParsed={setParsedDiffFiles}
                        />
                        <OrphanedAnswersSection answers={orphaned as AnswerDoc[]} />
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

                    {/* Question-level comments — same infra as standard questions (Phase 9) */}
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
