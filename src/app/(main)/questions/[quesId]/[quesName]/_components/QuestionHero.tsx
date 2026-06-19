"use client";

import React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import {
    ArrowDown,
    ArrowUp,
    Bookmark,
    Check,
    Flag,
    MoreHorizontal,
    Share2,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import {
    formatCount,
    useQuestionDetail,
} from "./QuestionDetailContext";
import CommentsSection from "./CommentsSection";
import { Avatar, ConfirmDialog } from "./shared";

const MarkdownPreview = dynamic(
    () => import("@uiw/react-md-editor").then((module) => module.default.Markdown),
    {
        ssr: false,
        loading: () => (
            <div className="space-y-3 p-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-white/[0.08]" />
                <div className="h-4 w-full animate-pulse rounded bg-white/[0.06]" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-white/[0.06]" />
            </div>
        ),
    }
);

// ─── MoreMenu ─────────────────────────────────────────────────────────────────

function MoreMenu({
    isOwner,
    onDelete,
    onReport,
    disabled = false,
}: {
    isOwner: boolean;
    onDelete: () => void;
    onReport: () => void;
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
        const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", handler);
        document.addEventListener("keydown", keyHandler);
        return () => {
            document.removeEventListener("mousedown", handler);
            document.removeEventListener("keydown", keyHandler);
        };
    }, [open]);

    const items = [
        ...(isOwner
            ? [
                  {
                      label: "Delete question",
                      icon: <Trash2 className="size-3.5" />,
                      onClick: () => { setOpen(false); onDelete(); },
                      danger: true,
                  },
              ]
            : []),
        {
            label: "Report",
            icon: <Flag className="size-3.5" />,
            onClick: () => { setOpen(false); onReport(); },
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
                className="flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-zinc-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="More options"
            >
                <MoreHorizontal className="size-4" />
            </button>

            {open && (
                <div className="absolute right-0 top-11 z-50 min-w-[160px] overflow-hidden rounded-xl border border-white/10 bg-[#0c0c0c]/95 py-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                    {items.map((item) => (
                        <button
                            key={item.label}
                            onClick={item.onClick}
                            className={cn(
                                "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm transition hover:bg-white/[0.05]",
                                item.danger ? "text-red-400/80 hover:text-red-400" : "text-zinc-400 hover:text-zinc-100"
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

// ─── QuestionHero ─────────────────────────────────────────────────────────────

export default function QuestionHero() {
    const {
        question,
        author,
        attachmentUrl,
        questionTags,
        totalViews,
        questionVoteScore,
        getVoteStatus,
        voteQuestion,
        currentUser,
        deleteQuestion,
        isDeletingQuestion,
    } = useQuestionDetail();

    const BOOKMARK_KEY = `bn_bookmark_q_${question.$id}`;
    const [bookmarked, setBookmarked] = React.useState(false);
    const [bookmarkReady, setBookmarkReady] = React.useState(false);
    const [canPersistBookmark, setCanPersistBookmark] = React.useState(true);
    const [copied, setCopied] = React.useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);

    React.useEffect(() => {
        try {
            setBookmarked(window.localStorage.getItem(BOOKMARK_KEY) === "1");
            setCanPersistBookmark(true);
        } catch {
            setCanPersistBookmark(false);
        } finally {
            setBookmarkReady(true);
        }
    }, [BOOKMARK_KEY]);

    const persistBookmark = (next: boolean) => {
        if (!canPersistBookmark) {
            toast.warning(
                next
                    ? "Bookmark saved for this session only"
                    : "Bookmark removed for this session",
                {
                    description: "Your browser is blocking persistent storage.",
                }
            );
            return;
        }

        try {
            if (next) {
                window.localStorage.setItem(BOOKMARK_KEY, "1");
                toast.success("Question bookmarked");
            } else {
                window.localStorage.removeItem(BOOKMARK_KEY);
                toast("Bookmark removed");
            }
        } catch {
            setCanPersistBookmark(false);
            toast.warning(
                next
                    ? "Bookmark saved for this session only"
                    : "Bookmark removed for this session",
                {
                    description: "Your browser is blocking persistent storage.",
                }
            );
        }
    };

    const toggleBookmark = () => {
        if (!bookmarkReady) return;
        const next = !bookmarked;
        setBookmarked(next);
        persistBookmark(next);
    };

    const votedStatus = getVoteStatus("question", question.$id);

    const handleShareCopy = async () => {
        if (isDeletingQuestion) return;
        await navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        toast("Question link copied", {
            description: "Link copied to clipboard.",
        });
        window.setTimeout(() => setCopied(false), 2000);
    };

    const handleReport = () => {
        toast("Report submitted. Thanks for keeping ByteNest safe.");
    };

    const isOwner = currentUser?.$id === question.authorId;
    const createdAtMs = new Date(question.$createdAt).getTime();
    const updatedAtMs = new Date(question.$updatedAt).getTime();
    const wasEdited =
        Number.isFinite(createdAtMs) &&
        Number.isFinite(updatedAtMs) &&
        updatedAtMs - createdAtMs > 60_000;

    return (
        <>
            <article id="question" className="relative grid grid-cols-[56px_minmax(0,1fr)] gap-5">
                {/* Left Column: Vote Rail */}
                <aside className="relative flex flex-col items-center pt-2">
                    <div className="flex shrink-0 flex-col items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.02] py-2 w-[44px]">
                        <button
                            onClick={() => voteQuestion("upvoted")}
                            disabled={isDeletingQuestion}
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
                                votedStatus === "upvoted"
                                    ? "text-orange-500"
                                    : votedStatus === "downvoted"
                                    ? "text-red-400"
                                    : "text-[#CFE8D5]"
                            )}
                        >
                            {questionVoteScore}
                        </span>
                        <button
                            onClick={() => voteQuestion("downvoted")}
                            disabled={isDeletingQuestion}
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

                    {/* Connector line */}
                    <div className="w-px h-3 bg-white/[0.08] shrink-0" />

                    <button
                        onClick={toggleBookmark}
                        aria-label={
                            !bookmarkReady
                                ? "Loading bookmark state"
                                : bookmarked
                                ? "Remove bookmark"
                                : "Bookmark question"
                        }
                        disabled={isDeletingQuestion || !bookmarkReady}
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
                    <header>
                        <h1 className="text-2xl font-bold leading-snug tracking-tight text-zinc-100 sm:text-3xl">
                            {question.title}
                        </h1>

                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-zinc-400">
                            <span>
                                Asked{" "}
                                <span className="text-zinc-300">
                                    {convertDateToRelativeTime(new Date(question.$createdAt))}
                                </span>
                            </span>
                            {wasEdited && (
                                <span>
                                    Modified{" "}
                                    <span className="text-zinc-300">
                                        {convertDateToRelativeTime(new Date(question.$updatedAt))}
                                    </span>
                                </span>
                            )}
                            <span>
                                Viewed{" "}
                                <span className="text-zinc-300">{formatCount(totalViews)} times</span>
                            </span>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
                            <div className="flex flex-wrap gap-2">
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
                                <button
                                    onClick={handleShareCopy}
                                    disabled={isDeletingQuestion}
                                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] font-medium text-zinc-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {copied ? <Check className="size-3.5" /> : <Share2 className="size-3.5" />}
                                    Share
                                </button>
                                <MoreMenu
                                    isOwner={isOwner}
                                    onDelete={() => setDeleteDialogOpen(true)}
                                    onReport={handleReport}
                                    disabled={isDeletingQuestion}
                                />
                            </div>
                        </div>
                    </header>

                    <div className="question-detail-markdown mt-5" data-color-mode="dark">
                        <MarkdownPreview source={String(question.content ?? "")} />
                    </div>

                    {attachmentUrl ? (
                        <div className="relative mt-6 h-[400px] max-h-[400px] overflow-hidden rounded-xl border border-white/[0.08] bg-black/30 p-2">
                            <Image
                                src={attachmentUrl}
                                alt={`Attachment for question: ${question.title}`}
                                fill
                                sizes="(min-width: 1280px) 900px, 100vw"
                                className="object-contain p-2"
                                unoptimized
                            />
                        </div>
                    ) : null}

                    {/* Author row */}
                    <div
                        className={cn(
                            "mt-8 flex flex-col gap-4 sm:flex-row sm:items-center",
                            wasEdited ? "sm:justify-between" : "sm:justify-end"
                        )}
                    >
                        {wasEdited && (
                            <span className="text-[13px] text-zinc-500">
                                Edited {convertDateToRelativeTime(new Date(question.$updatedAt))}
                            </span>
                        )}

                        <div className="flex items-center gap-2 rounded-xl bg-white/[0.03] p-1.5 pr-4">
                            <Avatar name={author.name} />
                            <div className="flex flex-col">
                                <Link
                                    href={`/users/${author.$id}/${slugify(author.name)}`}
                                    className="text-[13px] font-medium text-[#CFE8D5] transition hover:text-white"
                                >
                                    {author.name}
                                </Link>
                                <span className="text-[11px] font-bold text-zinc-400">
                                    {formatCount(author.reputation)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Question-level comments — previously entirely missing from this component */}
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

function formatQuestionVoteStatusForLabel(status: string | null | undefined) {
    if (status === "upvoted") return "You have upvoted this question";
    if (status === "downvoted") return "You have downvoted this question";
    return "You have not voted on this question";
}
