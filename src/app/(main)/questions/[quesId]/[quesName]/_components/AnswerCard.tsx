"use client";

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
    ChevronDown,
    ChevronUp,
    Check,
    Copy,
    Flag,
    MessageCircle,
    Share2,
    Bookmark,
    Trash2,
    MoreHorizontal,
    Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { markdownToPlainExcerpt } from "@/lib/sanitize";
import MarkdownPreview from "@/components/MarkdownPreview";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { AnswerDoc, useQuestionDetail } from "./QuestionDetailContext";
import CommentsSection from "./CommentsSection";
import { Avatar, ConfirmDialog } from "./shared";

// ─── AnswerMoreMenu ───────────────────────────────────────────────────────────

function AnswerMoreMenu({
    answerId,
    isOwner,
    onDelete,
    disabled = false,
}: {
    answerId: string;
    isOwner: boolean;
    onDelete: () => void;
    disabled?: boolean;
}) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const keyHandler = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", handler);
        document.addEventListener("keydown", keyHandler);
        return () => {
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("keydown", keyHandler);
        };
    }, [open]);

    const handleCopyLink = async () => {
        setOpen(false);
        const url = `${window.location.origin}${window.location.pathname}#answer-${answerId}`;
        await navigator.clipboard.writeText(url);
        toast("Answer link copied", {
            description: "Link copied to clipboard.",
        });
    };

    const handleReport = () => {
        setOpen(false);
        toast("Report submitted. Thanks for keeping ByteNest safe.");
    };

    const items = [
        {
            label: "Copy link",
            icon: <Copy className="size-3.5" />,
            onClick: handleCopyLink,
            danger: false,
        },
        ...(isOwner
            ? [
                  {
                      label: "Delete answer",
                      icon: <Trash2 className="size-3.5" />,
                      onClick: () => {
                          setOpen(false);
                          onDelete();
                      },
                      danger: true,
                  },
              ]
            : []),
        {
            label: "Report",
            icon: <Flag className="size-3.5" />,
            onClick: handleReport,
            danger: false,
        },
    ];

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => {
                    if (!disabled) setOpen((v) => !v);
                }}
                disabled={disabled}
                className="flex size-7 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="More options"
            >
                <MoreHorizontal className="size-4" />
            </button>

            {open && (
                <div className="absolute right-0 top-8 z-50 min-w-[160px] overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0c]/98 py-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
                    {items.map((item) => (
                        <button
                            key={item.label}
                            onClick={item.onClick}
                            className={cn(
                                "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition hover:bg-white/[0.05]",
                                item.danger
                                    ? "text-red-400/80 hover:text-red-400"
                                    : "text-zinc-400 hover:text-zinc-100"
                            )}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── VoteRail ─────────────────────────────────────────────────────────────────

function VoteRail({
    score,
    votedStatus,
    onUpvote,
    onDownvote,
    isAccepted,
    isQuestionAuthor,
    onAccept,
    isAccepting = false,
    disabled = false,
}: {
    score: number;
    votedStatus: string | null | undefined;
    onUpvote: () => void;
    onDownvote: () => void;
    isAccepted: boolean;
    isQuestionAuthor: boolean;
    onAccept: () => void;
    isAccepting?: boolean;
    disabled?: boolean;
}) {
    return (
        <div className="flex shrink-0 flex-col items-center gap-1.5 pt-1 w-10">
            <button
                onClick={(e) => { if (disabled) e.preventDefault(); else onUpvote(); }}
                aria-disabled={disabled}
                aria-label={`Upvote answer. Current score ${score}. ${formatVoteStatusForLabel(votedStatus)}.`}
                aria-pressed={votedStatus === "upvoted"}
                className={cn(
                    "flex size-9 items-center justify-center rounded-full transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
                    votedStatus === "upvoted"
                        ? "text-[#CFE8D5]"
                        : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                )}
            >
                <ChevronUp className="size-8" strokeWidth={1.5} />
            </button>

            <span
                className={cn(
                    "py-1 text-center text-lg font-bold leading-none",
                    votedStatus === "upvoted"
                        ? "text-[#CFE8D5]"
                        : votedStatus === "downvoted"
                        ? "text-red-400"
                        : "text-zinc-300"
                )}
            >
                {score}
            </span>

            <button
                onClick={(e) => { if (disabled) e.preventDefault(); else onDownvote(); }}
                aria-disabled={disabled}
                aria-label={`Downvote answer. Current score ${score}. ${formatVoteStatusForLabel(votedStatus)}.`}
                aria-pressed={votedStatus === "downvoted"}
                className={cn(
                    "flex size-9 items-center justify-center rounded-full transition-colors aria-disabled:cursor-not-allowed aria-disabled:opacity-50",
                    votedStatus === "downvoted"
                        ? "text-red-400"
                        : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                )}
            >
                <ChevronDown className="size-8" strokeWidth={1.5} />
            </button>

            <div className="mt-2 flex flex-col items-center gap-3">
                {isQuestionAuthor ? (
                    <button
                        onClick={onAccept}
                        disabled={disabled || isAccepting}
                        aria-busy={isAccepting}
                        title={isAccepted ? "Unaccept this answer" : "Accept this answer"}
                        className={cn(
                            "flex size-8 items-center justify-center transition-all duration-200 disabled:cursor-wait disabled:opacity-70",
                            isAccepted
                                ? "text-[#CFE8D5] drop-shadow-[0_0_8px_rgba(207,232,213,0.35)]"
                                : "text-zinc-600 hover:text-[#CFE8D5]"
                        )}
                    >
                        {isAccepting ? (
                            <Loader2 className="size-5 animate-spin" />
                        ) : (
                            <Check className="size-6" strokeWidth={2.5} />
                        )}
                    </button>
                ) : isAccepted ? (
                    <div
                        title="Accepted Answer"
                        className="flex size-8 items-center justify-center text-[#CFE8D5] drop-shadow-[0_0_8px_rgba(207,232,213,0.35)]"
                    >
                        <Check className="size-6" strokeWidth={2.5} />
                    </div>
                ) : null}
                
                <button
                    disabled={disabled}
                    aria-label="Bookmark answer"
                    className="flex size-8 items-center justify-center text-zinc-600 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Bookmark className="size-5" />
                </button>
            </div>
        </div>
    );
}

// ─── AnswerCard ───────────────────────────────────────────────────────────────

export default function AnswerCard({
    answer,
    variant = "default",
}: {
    answer: AnswerDoc;
    variant?: "default" | "best";
}) {
    const {
        currentUser,
        getVoteStatus,
        voteAnswer,
        getAnswerScore,
        deleteAnswer,
        isQuestionAuthor,
        acceptAnswer,
        isDeletingQuestion,
        acceptingAnswerId,
        question,
    } = useQuestionDetail();

    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);

    const votedStatus = getVoteStatus("answer", answer.$id);
    const voteScore = getAnswerScore(answer);
    const isAnswerOwner = currentUser?.$id === answer.authorId;
    const isOriginalPoster = answer.authorId === question.authorId;
    const commentCount = answer.comments?.total || 0;
    const isBest = variant === "best" || answer.isAccepted;
    const interactionsDisabled = isDeletingQuestion || isDeleting;
    const isAccepting = acceptingAnswerId === answer.$id;
    const commentComposerId = `comment-composer-answer-${answer.$id}`;
    const createdAtMs = new Date(answer.$createdAt).getTime();
    const updatedAtMs = new Date(answer.$updatedAt).getTime();
    const wasEdited = Number.isFinite(createdAtMs) && Number.isFinite(updatedAtMs) && updatedAtMs - createdAtMs > 60_000;

    const handleConfirmDelete = async () => {
        if (isDeletingQuestion) return;
        setIsDeleting(true);
        const deleted = await deleteAnswer(answer.$id);
        setIsDeleting(false);
        if (deleted) setDeleteDialogOpen(false);
    };

    const handleShare = async () => {
        if (interactionsDisabled) return;
        const url = `${window.location.origin}${window.location.pathname}#answer-${answer.$id}`;
        await navigator.clipboard.writeText(url);
        toast("Answer link copied", {
            description: "Link copied to clipboard.",
        });
    };

    const focusCommentComposer = () => {
        if (interactionsDisabled) return;
        const composer = document.getElementById(commentComposerId);
        composer?.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => {
            composer?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
        }, 250);
    };

    return (
        <article
            id={`answer-${answer.$id}`}
            className="relative flex gap-4 w-full transition-all duration-200"
        >
            {/* Vote rail - Outside on the left */}
            <VoteRail
                score={voteScore}
                votedStatus={votedStatus}
                onUpvote={() => voteAnswer(answer.$id, "upvoted")}
                onDownvote={() => voteAnswer(answer.$id, "downvoted")}
                isAccepted={answer.isAccepted}
                isQuestionAuthor={isQuestionAuthor}
                onAccept={() => acceptAnswer(answer.$id)}
                isAccepting={isAccepting}
                disabled={interactionsDisabled}
            />

            {/* Content Container - Bordered box */}
            <div
                className={cn(
                    "flex-1 min-w-0 rounded-xl border border-white/[0.05] bg-[#0c0c0c] p-5",
                    isBest && "border-[#CFE8D5]/20 bg-[#CFE8D5]/[0.025]"
                )}
            >
                {/* Author row */}
                <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Avatar name={answer.author.name} />
                        <Link
                            href={`/users/${answer.author.$id}/${slugify(answer.author.name)}`}
                            className="text-sm font-semibold text-zinc-200 transition hover:text-white"
                        >
                            {answer.author.name}
                        </Link>
                        {isOriginalPoster && (
                            <span className="rounded bg-[#CFE8D5]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#CFE8D5] uppercase tracking-wide">
                                OP
                            </span>
                        )}
                        <span className="text-zinc-600 text-sm">·</span>
                        <span className="text-sm text-zinc-500">
                            answered {convertDateToRelativeTime(new Date(answer.$createdAt))}
                        </span>
                    </div>

                    <div className="flex items-center gap-3">
                        {wasEdited && (
                            <span className="text-xs text-zinc-600">Edited {convertDateToRelativeTime(new Date(answer.$updatedAt))}</span>
                        )}
                        <AnswerMoreMenu
                            answerId={answer.$id}
                            isOwner={isAnswerOwner}
                            onDelete={() => setDeleteDialogOpen(true)}
                            disabled={interactionsDisabled}
                        />
                    </div>
                </div>

                {/* Markdown body */}
                <div
                    className="question-detail-markdown"
                    data-color-mode="dark"
                    role="region"
                    aria-label="Answer body"
                >
                    <MarkdownPreview source={answer.content} />
                </div>

                {/* Action bar */}
                <div className="mt-5 flex items-center gap-6 text-[13px] font-medium text-zinc-500">
                    <button
                        onClick={focusCommentComposer}
                        disabled={interactionsDisabled}
                        className="flex items-center gap-2 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <MessageCircle className="size-4" />
                        Comment
                    </button>

                    <button
                        onClick={handleShare}
                        disabled={interactionsDisabled}
                        className="flex items-center gap-2 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Share2 className="size-4" />
                        Share
                    </button>
                </div>

                {/* Discussion thread */}
                <div className="mt-6 border-t border-white/[0.05] pt-4">
                    <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                            <MessageCircle className="size-4" />
                            Comments ({commentCount})
                        </h4>
                    </div>
                    <CommentsSection type="answer" typeId={answer.$id} />
                </div>
            </div>

            <ConfirmDialog
                open={deleteDialogOpen}
                title="Delete this answer?"
                description="This permanently removes the answer and its comments. This cannot be undone."
                confirmLabel={isDeleting ? "Deleting…" : "Delete answer"}
                destructive
                onCancel={() => setDeleteDialogOpen(false)}
                onConfirm={handleConfirmDelete}
                busy={isDeleting}
            />
        </article>
    );
}

function formatVoteStatusForLabel(status: string | null | undefined) {
    if (status === "upvoted") return "You have upvoted this answer";
    if (status === "downvoted") return "You have downvoted this answer";
    return "You have not voted on this answer";
}
