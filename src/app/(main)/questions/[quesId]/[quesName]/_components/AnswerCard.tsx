"use client";

import React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
    ArrowDown,
    ArrowUp,
    Check,
    Copy,
    Flag,
    MessageCircle,
    Share2,
    ThumbsUp,
    Trash2,
    MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { AnswerDoc, formatCount, useQuestionDetail } from "./QuestionDetailContext";
import CommentsSection from "./CommentsSection";
import { Avatar, ConfirmDialog } from "./shared";

// ─── AnswerMoreMenu ───────────────────────────────────────────────────────────

function AnswerMoreMenu({
    answerId,
    isOwner,
    onDelete,
}: {
    answerId: string;
    isOwner: boolean;
    onDelete: () => void;
}) {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
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
        toast.success("Answer link copied");
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
                      onClick: () => { setOpen(false); onDelete(); },
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
                onClick={() => setOpen((v) => !v)}
                className="text-zinc-500 transition hover:text-zinc-300"
                aria-label="More options"
            >
                <MoreHorizontal className="size-4" />
            </button>

            {open && (
                <div className="absolute right-0 top-7 z-50 min-w-[160px] overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0c]/95 py-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">
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
    } = useQuestionDetail();

    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);

    const votedStatus = getVoteStatus("answer", answer.$id);
    const voteScore = getAnswerScore(answer);
    const isOwner = currentUser?.$id === answer.authorId;

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        const deleted = await deleteAnswer(answer.$id);
        setIsDeleting(false);
        if (deleted) setDeleteDialogOpen(false);
    };

    return (
        <article
            id={`answer-${answer.$id}`}
            className="relative grid grid-cols-[56px_minmax(0,1fr)] gap-5"
        >
            {/* Left Column: Vote Rail */}
            <aside className="relative flex flex-col items-center gap-3 pt-2">
                <div className="absolute bottom-[-60px] left-[28px] top-[140px] w-px bg-white/[0.08]" />

                <div className="z-10 flex flex-col items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] py-2 w-[44px]">
                    <button
                        onClick={() => voteAnswer(answer.$id, "upvoted")}
                        className={cn(
                            "flex h-8 w-full items-center justify-center transition hover:text-[#CFE8D5]",
                            votedStatus === "upvoted" ? "text-[#CFE8D5]" : "text-zinc-500"
                        )}
                    >
                        <ArrowUp className="size-5" />
                    </button>
                    <span
                        className={cn(
                            "text-lg font-bold",
                            votedStatus === "upvoted"
                                ? "text-[#CFE8D5]"
                                : votedStatus === "downvoted"
                                ? "text-red-400"
                                : "text-[#CFE8D5]"
                        )}
                    >
                        {voteScore}
                    </span>
                    <button
                        onClick={() => voteAnswer(answer.$id, "downvoted")}
                        className={cn(
                            "flex h-8 w-full items-center justify-center transition hover:text-red-400",
                            votedStatus === "downvoted" ? "text-red-400" : "text-zinc-500"
                        )}
                    >
                        <ArrowDown className="size-5" />
                    </button>
                </div>

                {variant === "best" && (
                    <div className="z-10 mt-2 flex size-10 items-center justify-center rounded-full border border-[#CFE8D5]/35 bg-[#CFE8D5]/10 text-[#CFE8D5]">
                        <Check className="size-4" />
                    </div>
                )}
            </aside>

            {/* Right Column: Content */}
            <div
                className={cn(
                    "min-w-0 rounded-2xl border p-6 transition-all duration-200",
                    variant === "best"
                        ? "border-[#CFE8D5]/20 bg-[linear-gradient(135deg,rgba(207,232,213,0.03),rgba(255,255,255,0.01))]"
                        : "border-white/[0.07] bg-white/[0.02]"
                )}
            >
                {/* Author Info */}
                <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <Avatar name={answer.author.name} />
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <Link
                                    href={`/users/${answer.author.$id}/${slugify(answer.author.name)}`}
                                    className="text-[14px] font-bold text-zinc-100 transition hover:text-[#CFE8D5]"
                                >
                                    {answer.author.name}
                                </Link>
                                {answer.author.reputation > 50 && (
                                    <span className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
                                        Top Contributor
                                    </span>
                                )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px] text-zinc-400">
                                <span className="flex items-center gap-1 font-medium">
                                    <span className="text-[#CFE8D5]">●</span>{" "}
                                    {formatCount(answer.author.reputation)} rep
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {variant === "best" && (
                            <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#CFE8D5]">
                                <Check className="size-4" />
                                Accepted
                            </div>
                        )}
                        <span className="text-[13px] text-zinc-500">
                            {convertDateToRelativeTime(new Date(answer.$createdAt))}
                        </span>
                        <AnswerMoreMenu
                            answerId={answer.$id}
                            isOwner={isOwner}
                            onDelete={() => setDeleteDialogOpen(true)}
                        />
                    </div>
                </div>

                {/* Markdown Content */}
                <div className="question-detail-markdown" data-color-mode="dark">
                    <AnswerMarkdown source={answer.content} />
                </div>

                {/* Footer Actions */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-4 text-[13px] font-medium text-zinc-400">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={async () => {
                                const url = `${window.location.origin}${window.location.pathname}#answer-${answer.$id}`;
                                await navigator.clipboard.writeText(url);
                                toast.success("Answer link copied");
                            }}
                            className="flex items-center gap-1.5 transition hover:text-zinc-200"
                        >
                            <Share2 className="size-3.5" /> Share
                        </button>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-zinc-500">Was this helpful?</span>
                        <div className="flex items-center gap-2">
                            <button className="flex h-8 items-center gap-1.5 rounded-lg border border-[#CFE8D5]/20 bg-[#CFE8D5]/5 px-3 text-[#CFE8D5] transition hover:bg-[#CFE8D5]/10">
                                <ThumbsUp className="size-3.5" /> {Math.max(voteScore, 0)}
                            </button>
                            <button className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 transition hover:bg-white/[0.05] hover:text-zinc-200">
                                <MessageCircle className="size-3.5" />{" "}
                                {answer.comments?.total || 0}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-4">
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
            />
        </article>
    );
}

const AnswerMarkdown = dynamic(
    () => import("@uiw/react-md-editor").then((module) => module.default.Markdown),
    {
        ssr: false,
        loading: () => (
            <div className="space-y-3 p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.08]" />
                <div className="h-4 w-full animate-pulse rounded bg-white/[0.06]" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-white/[0.06]" />
            </div>
        ),
    }
);
