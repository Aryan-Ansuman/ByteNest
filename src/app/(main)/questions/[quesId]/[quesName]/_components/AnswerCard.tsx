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
    GitBranch,
    MessageCircle,
    Trash2,
    MoreHorizontal,
    Loader2,
    Tag as TagIcon,
} from "lucide-react";
import { toast } from "sonner";
import { markdownToPlainExcerpt } from "@/lib/sanitize";
import MarkdownPreview from "@/components/MarkdownPreview";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { AnswerDoc, MAX_BRANCH_DEPTH, useQuestionDetail } from "./QuestionDetailContext";
import CommentsSection from "./CommentsSection";
import { Avatar, ConfirmDialog } from "./shared";
import ShareMenu, { copyText } from "./ShareMenu";
import VerificationBadge from "./VerificationBadge";
import VersionContextEditor, { EMPTY_VERSION_CONTEXT, type VersionContextValue } from "./VersionContextEditor";
import FreshnessBadge from "./FreshnessBadge";
import StalenessReportButton from "./StalenessReportButton";
import ConfirmStillValidButton from "./ConfirmStillValidButton";
import BranchCreationForm from "./BranchCreationForm";

// ─── AnswerMoreMenu ───────────────────────────────────────────────────────────

function AnswerMoreMenu({
    answer,
    isOwner,
    onDelete,
    onEditVersion,
    disabled = false,
}: {
    answer: AnswerDoc;
    isOwner: boolean;
    onDelete: () => void;
    onEditVersion: () => void;
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
        const answerId = answer.$id;
        const base = `${window.location.origin}${window.location.pathname}`;
        const url = answer.condition
            ? `${base}?setup=${encodeURIComponent(answer.condition)}#answer-${answerId}`
            : `${base}#answer-${answerId}`;
        try {
            await copyText(url);
            toast.success("Answer link copied");
        } catch {
            toast.error("Could not copy the answer link");
        }
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
                      label: "Edit version context",
                      icon: <TagIcon className="size-3.5" />,
                      onClick: () => {
                          setOpen(false);
                          onEditVersion();
                      },
                      danger: false,
                  },
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
                <div className="absolute right-0 top-8 z-50 min-w-[160px] overflow-hidden rounded-xl border border-white/5 bg-[#0c0c0c]/98 py-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl">
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
    votePending = false,
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
    votePending?: boolean;
    disabled?: boolean;
}) {
    return (
        <div className="flex shrink-0 flex-col items-center gap-1.5 pt-1 w-10">
            <button
                onClick={onUpvote}
                disabled={disabled || votePending}
                aria-busy={votePending}
                aria-label={`Upvote answer. Current score ${score}. ${formatVoteStatusForLabel(votedStatus)}.`}
                aria-pressed={votedStatus === "upvoted"}
                className={cn(
                    "flex size-9 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
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
                onClick={onDownvote}
                disabled={disabled || votePending}
                aria-busy={votePending}
                aria-label={`Downvote answer. Current score ${score}. ${formatVoteStatusForLabel(votedStatus)}.`}
                aria-pressed={votedStatus === "downvoted"}
                className={cn(
                    "flex size-9 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                    votedStatus === "downvoted"
                        ? "text-red-400"
                        : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                )}
            >
                <ChevronDown className="size-8" strokeWidth={1.5} />
            </button>

            <div className="mt-2 flex flex-col items-center">
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
        isVotePending,
        voteAnswer,
        getAnswerScore,
        deleteAnswer,
        isQuestionAuthor,
        acceptAnswer,
        isDeletingQuestion,
        acceptingAnswerId,
        question,
        pendingAcceptOverride,
        confirmAcceptOverride,
        cancelAcceptOverride,
        updateAnswerVersionContext,
        patchAnswerFreshness,
        getBranchCount,
    } = useQuestionDetail();

    const canRetryVerification =
        currentUser?.$id === answer.authorId || currentUser?.$id === question.authorId;

    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [versionEditorOpen, setVersionEditorOpen] = React.useState(false);
    const [versionDraft, setVersionDraft] = React.useState<VersionContextValue>(EMPTY_VERSION_CONTEXT);
    const [isSavingVersion, setIsSavingVersion] = React.useState(false);
    const [branchFormOpen, setBranchFormOpen] = React.useState(false);

    const branchDepth = answer.branchDepth ?? 0;
    const canBranch = branchDepth < MAX_BRANCH_DEPTH;
    const branchCount = getBranchCount(answer.$id);
    const isRootAnswer = branchDepth === 0;

    const questionTags = React.useMemo(
        () => (Array.isArray(question.tags) ? question.tags.filter(Boolean) : []),
        [question.tags]
    );

    const openVersionEditor = () => {
        setVersionDraft({
            techPackage: answer.techPackage ?? "",
            techEcosystem: answer.techEcosystem ?? null,
            versionMin: answer.versionMin ?? "",
            versionMax: answer.versionMax ?? "",
        });
        setVersionEditorOpen(true);
    };

    const handleSaveVersion = async () => {
        setIsSavingVersion(true);
        const saved = await updateAnswerVersionContext(answer.$id, {
            versionMin: versionDraft.versionMin.trim() || "",
            versionMax: versionDraft.versionMax.trim() || "",
            techPackage: versionDraft.techPackage.trim() || "",
            techEcosystem: versionDraft.techEcosystem,
        });
        setIsSavingVersion(false);
        if (saved) setVersionEditorOpen(false);
    };

    const votedStatus = getVoteStatus("answer", answer.$id);
    const voteScore = getAnswerScore(answer);
    const isAnswerOwner = currentUser?.$id === answer.authorId;
    const isOriginalPoster = answer.authorId === question.authorId;
    const commentCount = answer.comments?.total || 0;
    const isBest = variant === "best" || answer.isAccepted;
    const interactionsDisabled = isDeletingQuestion || isDeleting;
    const isAccepting = acceptingAnswerId === answer.$id;
    const answerVotePending = isVotePending("answer", answer.$id);
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
            className="relative flex w-full gap-2 transition-all duration-200 sm:gap-4"
        >
            {/* Vote rail - Outside on the left */}
            <div className="flex flex-col items-center gap-2">
                {question.questionType === "pr_linked" && (
                    <span className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                        General
                    </span>
                )}
                <VoteRail
                    score={voteScore}
                    votedStatus={votedStatus}
                    onUpvote={() => voteAnswer(answer.$id, "upvoted")}
                    onDownvote={() => voteAnswer(answer.$id, "downvoted")}
                    isAccepted={answer.isAccepted}
                    isQuestionAuthor={isQuestionAuthor && question.questionType !== "adr"}
                    onAccept={() => acceptAnswer(answer.$id)}
                    isAccepting={isAccepting}
                    votePending={answerVotePending}
                    disabled={interactionsDisabled}
                />
            </div>

            {/* Content Container - Bordered box */}
            <div
                className={cn(
                    "min-w-0 flex-1 rounded-xl border border-white/[0.05] bg-[#0c0c0c] p-3 sm:p-5",
                    isBest && "border-[#CFE8D5]/20 bg-[#CFE8D5]/[0.025]",
                    answer.freshnessLabel === "stale" && "opacity-80"
                )}
            >
                {/* Author row */}
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
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
                        {question.hasTestSuite && (
                            <VerificationBadge
                                answerId={answer.$id}
                                initialStatus={answer.verificationStatus}
                                initialScore={answer.verificationScore}
                                canRetry={canRetryVerification}
                            />
                        )}
                        <span className="text-zinc-600 text-sm">·</span>
                        <span className="text-sm text-zinc-500">
                            answered {convertDateToRelativeTime(new Date(answer.$createdAt))}
                        </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                        {wasEdited && (
                            <span className="text-xs text-zinc-600">Edited {convertDateToRelativeTime(new Date(answer.$updatedAt))}</span>
                        )}

                        <AnswerMoreMenu
                            answer={answer}
                            isOwner={isAnswerOwner}
                            onDelete={() => setDeleteDialogOpen(true)}
                            onEditVersion={openVersionEditor}
                            disabled={interactionsDisabled}
                        />
                    </div>
                </div>

                {(answer.freshnessLabel === "aging" ||
                    answer.freshnessLabel === "outdated" ||
                    answer.freshnessLabel === "stale") && (
                    <div className="mb-4 flex flex-wrap items-center gap-3">
                        <FreshnessBadge
                            label={answer.freshnessLabel}
                            lastFreshnessCheck={answer.lastFreshnessCheck}
                            techPackage={answer.techPackage}
                            versionMax={answer.versionMax}
                            stalenessVoteCount={answer.stalenessVoteCount}
                        />
                        {isAnswerOwner &&
                            (answer.freshnessLabel === "outdated" || answer.freshnessLabel === "stale") && (
                                <ConfirmStillValidButton
                                    answerId={answer.$id}
                                    disabled={interactionsDisabled}
                                    onConfirmed={(result) =>
                                        patchAnswerFreshness(answer.$id, {
                                            freshnessScore: result.freshnessScore,
                                            freshnessLabel: result.freshnessLabel,
                                            verifiedByAuthorAt: result.verifiedByAuthorAt,
                                        })
                                    }
                                />
                            )}
                    </div>
                )}

                {/* Markdown body */}
                <div
                    className="question-detail-markdown"
                    data-color-mode="dark"
                    role="region"
                    aria-label="Answer body"
                >
                    <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/40">
                        <MarkdownPreview source={answer.content} />
                    </div>

                    {versionEditorOpen && (
                        <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/20 p-4">
                            <div className="mb-1 flex items-center justify-between">
                                <p className="text-xs font-medium text-zinc-400">Edit version context</p>
                            </div>
                            <VersionContextEditor
                                questionTags={questionTags}
                                value={versionDraft}
                                onChange={setVersionDraft}
                                disabled={isSavingVersion}
                            />
                            <div className="mt-3 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setVersionEditorOpen(false)}
                                    disabled={isSavingVersion}
                                    className="h-9 rounded-xl border border-white/[0.08] px-3.5 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveVersion}
                                    disabled={isSavingVersion}
                                    className="flex h-9 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-3.5 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2] disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isSavingVersion ? <Loader2 className="size-3.5 animate-spin" /> : null}
                                    {isSavingVersion ? "Saving..." : "Save"}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {canBranch && branchCount === 0 && !branchFormOpen && (
                    <button
                        type="button"
                        onClick={() => setBranchFormOpen(true)}
                        disabled={interactionsDisabled}
                        className="mt-4 flex w-full items-center gap-2 rounded-xl border border-dashed border-[#a7c8b3]/25 px-3.5 py-2.5 text-left text-xs font-medium text-[#a7c8b3]/70 transition hover:border-[#a7c8b3]/40 hover:text-[#a7c8b3] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <GitBranch className="size-3.5 shrink-0" />
                        Add a branch for a specific environment or version
                        <span aria-hidden="true">→</span>
                    </button>
                )}

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

                    <ShareMenu
                        getUrl={() =>
                            `${window.location.origin}${window.location.pathname}#answer-${answer.$id}`
                        }
                        title={`Answer to: ${question.title}`}
                        text={markdownToPlainExcerpt(answer.content, 180)}
                        disabled={interactionsDisabled}
                        variant="inline"
                        align="left"
                    />

                    {!isAnswerOwner && (
                        <StalenessReportButton
                            answerId={answer.$id}
                            stalenessVoteCount={answer.stalenessVoteCount ?? 0}
                            hasReported={Boolean(answer.viewerHasReportedStale)}
                            disabled={interactionsDisabled}
                            onReported={(count) =>
                                patchAnswerFreshness(answer.$id, {
                                    stalenessVoteCount: count,
                                    viewerHasReportedStale: true,
                                })
                            }
                            onRetracted={(count) =>
                                patchAnswerFreshness(answer.$id, {
                                    stalenessVoteCount: count,
                                    viewerHasReportedStale: false,
                                })
                            }
                        />
                    )}

                    {canBranch && (
                        <button
                            onClick={() => setBranchFormOpen((v) => !v)}
                            disabled={interactionsDisabled}
                            aria-expanded={branchFormOpen}
                            className={cn(
                                "flex items-center gap-2 transition disabled:cursor-not-allowed disabled:opacity-50",
                                branchFormOpen ? "text-[#a7c8b3]" : "hover:text-[#a7c8b3]"
                            )}
                        >
                            <GitBranch className="size-4" />
                            Add branch
                            {branchCount > 0 && (
                                <span className="text-zinc-600">({branchCount})</span>
                            )}
                        </button>
                    )}
                </div>

                {/* Inline branch creation form */}
                <div
                    className={cn(
                        "grid transition-[grid-template-rows] duration-300 ease-out",
                        branchFormOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    )}
                >
                    <div className="overflow-hidden">
                        {branchFormOpen && (
                            <BranchCreationForm
                                parentAnswerId={answer.$id}
                                onDone={() => setBranchFormOpen(false)}
                            />
                        )}
                    </div>
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

            <ConfirmDialog
                open={pendingAcceptOverride?.answerId === answer.$id}
                title="Accept anyway?"
                description="This answer hasn't passed the test suite. Sometimes the test suite itself is wrong — you can still accept this answer if you're confident it's correct."
                confirmLabel={isAccepting ? "Accepting…" : "Accept anyway"}
                onCancel={cancelAcceptOverride}
                onConfirm={confirmAcceptOverride}
                busy={isAccepting}
            />
        </article>
    );
}

function formatVoteStatusForLabel(status: string | null | undefined) {
    if (status === "upvoted") return "You have upvoted this answer";
    if (status === "downvoted") return "You have downvoted this answer";
    return "You have not voted on this answer";
}
