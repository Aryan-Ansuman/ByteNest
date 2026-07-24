"use client";

/**
 * AnswerTreeNode
 * ──────────────
 * Recursive renderer for the branching answer tree (Phase 4). Root answers
 * (depth 0) render exactly like the existing `AnswerCard`, with a
 * "N branch replies" expand/collapse toggle beneath. Branches (depth 1–2)
 * render as a visually indented, connector-lined compact card — the same
 * visual language as GitHub's PR review threads — with a condition chip
 * making the branch's applicability immediately visible.
 *
 * Only ever mounted when `useTreeMode` is true (see ContentTabs.tsx); flat
 * questions keep rendering the plain `AnswerCard` list unchanged.
 */

import React from "react";
import Link from "next/link";
import {
    Check,
    ChevronDown,
    ChevronUp,
    GitBranch,
    Loader2,
    MessageCircle,
    Trash2,
} from "lucide-react";
import MarkdownPreview from "@/components/MarkdownPreview";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { AnswerDoc, useQuestionDetail } from "./QuestionDetailContext";
import AnswerCard from "./AnswerCard";
import CommentsSection from "./CommentsSection";
import { Avatar, ConfirmDialog } from "./shared";

// Decision 2 (Phase 0): hard branching depth cap — root=0, child=1, grandchild=2.
const MAX_BRANCH_DEPTH = 2;

interface AnswerTreeNodeProps {
    answer: AnswerDoc;
    depth: number;
    /** Whether the "What's your setup?" navigator (Phase 6) currently has any condition chips selected. */
    isNavigatorActive: boolean;
}

export default function AnswerTreeNode({ answer, depth, isNavigatorActive }: AnswerTreeNodeProps) {
    const { navigatorSelections, answerTree, expandedAnswerIds, expandAnswer, acceptedPathIds, acceptedAnswerId } = useQuestionDetail();
    const children = answer.children ?? [];
    const hasChildren = children.length > 0;

    // Controlled by context so deep-link/accept effects can force this open,
    // but the user's own click still toggles it locally afterward.
    const [localExpanded, setLocalExpanded] = React.useState(
        () => depth === 0 && answerTree.length <= 3
    );
    const isExpanded = localExpanded || expandedAnswerIds.has(answer.$id);

    // Navigator dim state (Phase 6 wiring)
    const isFiltered =
        depth > 0 &&
        isNavigatorActive &&
        Boolean(answer.condition) &&
        !navigatorSelections.has(answer.condition as string);

    const isOnAcceptedPath = acceptedPathIds.has(answer.$id);
    const isAcceptedNode = answer.$id === acceptedAnswerId;

    if (depth === 0) {
        return (
            <div className="space-y-3" id={`answer-${answer.$id}`}>
                <AnswerCard answer={answer} variant={answer.isAccepted ? "best" : "default"} />

                {hasChildren && (
                    <div className="pl-1">
                        <button
                            type="button"
                            onClick={() => {
                                expandAnswer(answer.$id);
                                setLocalExpanded((v) => !v);
                            }}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[#a7c8b3] transition hover:text-[#c3e0cb]"
                        >
                            <GitBranch className="size-3.5" />
                            {children.length} branch {children.length === 1 ? "reply" : "replies"}
                            {isExpanded ? (
                                <ChevronUp className="size-3.5" />
                            ) : (
                                <ChevronDown className="size-3.5" />
                            )}
                        </button>

                        {isExpanded && (
                            <div className="mt-3 space-y-3">
                                {children.map((child) => (
                                    <AnswerTreeNode
                                        key={child.$id}
                                        answer={child}
                                        depth={1}
                                        isNavigatorActive={isNavigatorActive}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    }

    // depth 1 / depth 2 — compact, indented branch card with a left
    // connector border, GitHub-PR-thread style.
    return (
        <div
            id={`answer-${answer.$id}`}
            className={cn(
                "border-l-2 pl-4 transition-opacity duration-200",
                depth === 1 ? "ml-8" : "ml-16",
                isOnAcceptedPath ? "border-[#a7c8b3]" : "border-[#a7c8b3]/30",
                isFiltered && "pointer-events-none opacity-40"
            )}
        >
            {answer.condition && (
                <div
                    className={cn(
                        "mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                        "bg-[#a7c8b3]/10 border-[#a7c8b3]/20 text-[#a7c8b3]"
                    )}
                >
                    <GitBranch className="size-3" />
                    {answer.condition}
                    {/* lighter "seen a resolution below" indicator on the parent's chip */}
                    {isOnAcceptedPath && !isAcceptedNode && (
                        <Check className="ml-1 size-3 opacity-50" aria-label="Leads to accepted answer" />
                    )}
                </div>
            )}

            <BranchAnswerCard answer={answer} />

            {hasChildren && depth < MAX_BRANCH_DEPTH && (
                <div className="mt-2 pl-1">
                    <button
                        type="button"
                        onClick={() => {
                            expandAnswer(answer.$id);
                            setLocalExpanded((v) => !v);
                        }}
                        className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#a7c8b3] transition hover:text-[#c3e0cb]"
                    >
                        <GitBranch className="size-3.5" />
                        {children.length} branch {children.length === 1 ? "reply" : "replies"}
                        {isExpanded ? (
                            <ChevronUp className="size-3.5" />
                        ) : (
                            <ChevronDown className="size-3.5" />
                        )}
                    </button>

                    {isExpanded && (
                        <div className="space-y-3">
                            {children.map((child) => (
                                <AnswerTreeNode
                                    key={child.$id}
                                    answer={child}
                                    depth={depth + 1}
                                    isNavigatorActive={isNavigatorActive}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── BranchAnswerCard ───────────────────────────────────────────────────────
// Compact depth-1/2 card: smaller avatar, reduced font size, condition chip.
// Voting/accept/comment/delete reuse the same context actions as AnswerCard,
// just at a visually condensed scale (Decision 4 — branch votes display at
// a smaller scale than root-level votes).

function BranchAnswerCard({ answer }: { answer: AnswerDoc }) {
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
    } = useQuestionDetail();

    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [commentsOpen, setCommentsOpen] = React.useState(false);

    const votedStatus = getVoteStatus("answer", answer.$id);
    const voteScore = getAnswerScore(answer);
    const isAnswerOwner = currentUser?.$id === answer.authorId;
    const isOriginalPoster = answer.authorId === question.authorId;
    const commentCount = answer.comments?.total ?? 0;
    const interactionsDisabled = isDeletingQuestion || isDeleting;
    const isAccepting = acceptingAnswerId === answer.$id;
    const answerVotePending = isVotePending("answer", answer.$id);

    const handleConfirmDelete = async () => {
        if (isDeletingQuestion) return;
        setIsDeleting(true);
        // Decision 6 — the server blocks deletion (400) if this branch has
        // its own branch replies; deleteAnswer already toasts that error,
        // so no special handling is needed here beyond leaving the dialog
        // open on failure.
        const deleted = await deleteAnswer(answer.$id);
        setIsDeleting(false);
        if (deleted) setDeleteDialogOpen(false);
    };

    return (
        <article
            className={cn(
                "rounded-lg border border-white/[0.05] bg-[#0c0c0c] p-3 sm:p-4",
                answer.isAccepted && "border-[#CFE8D5]/20 bg-[#CFE8D5]/[0.025]"
            )}
        >
            {/* Author row — smaller avatar, reduced font size */}
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Avatar name={answer.author.name} small />
                    <Link
                        href={`/users/${answer.author.$id}/${slugify(answer.author.name)}`}
                        className="text-xs font-semibold text-zinc-200 transition hover:text-white"
                    >
                        {answer.author.name}
                    </Link>
                    {isOriginalPoster && (
                        <span className="rounded bg-[#CFE8D5]/10 px-1 py-0.5 text-[9px] font-bold text-[#CFE8D5] uppercase tracking-wide">
                            OP
                        </span>
                    )}
                    <span className="text-xs text-zinc-600">·</span>
                    <span className="text-xs text-zinc-500">
                        {convertDateToRelativeTime(new Date(answer.$createdAt))}
                    </span>
                </div>

                {isAnswerOwner && (
                    <button
                        type="button"
                        onClick={() => setDeleteDialogOpen(true)}
                        disabled={interactionsDisabled}
                        aria-label="Delete branch"
                        className="flex size-6 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.06] hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Trash2 className="size-3.5" />
                    </button>
                )}
            </div>

            {/* Content — slightly reduced font size */}
            <div className="question-detail-markdown text-sm" data-color-mode="dark">
                <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed prose-pre:bg-black/40">
                    <MarkdownPreview source={answer.content} />
                </div>
            </div>

            {/* Compact action bar — vote score renders at a smaller scale than root answers */}
            <div className="mt-3 flex items-center gap-4 text-xs font-medium text-zinc-500">
                <div className="flex items-center gap-0.5">
                    <button
                        type="button"
                        onClick={() => voteAnswer(answer.$id, "upvoted")}
                        disabled={interactionsDisabled || answerVotePending}
                        aria-pressed={votedStatus === "upvoted"}
                        aria-label="Upvote branch"
                        className={cn(
                            "flex size-6 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            votedStatus === "upvoted"
                                ? "text-[#CFE8D5]"
                                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                        )}
                    >
                        <ChevronUp className="size-4" strokeWidth={1.5} />
                    </button>
                    <span
                        className={cn(
                            "min-w-[1.25rem] text-center text-xs font-bold",
                            votedStatus === "upvoted"
                                ? "text-[#CFE8D5]"
                                : votedStatus === "downvoted"
                                ? "text-red-400"
                                : "text-zinc-300"
                        )}
                    >
                        {voteScore}
                    </span>
                    <button
                        type="button"
                        onClick={() => voteAnswer(answer.$id, "downvoted")}
                        disabled={interactionsDisabled || answerVotePending}
                        aria-pressed={votedStatus === "downvoted"}
                        aria-label="Downvote branch"
                        className={cn(
                            "flex size-6 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            votedStatus === "downvoted"
                                ? "text-red-400"
                                : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                        )}
                    >
                        <ChevronDown className="size-4" strokeWidth={1.5} />
                    </button>
                </div>

                {isQuestionAuthor && question.questionType !== "adr" ? (
                    <button
                        type="button"
                        onClick={() => acceptAnswer(answer.$id)}
                        disabled={interactionsDisabled || isAccepting}
                        aria-busy={isAccepting}
                        title={answer.isAccepted ? "Unaccept this branch" : "Accept this branch"}
                        className={cn(
                            "flex items-center transition disabled:cursor-wait disabled:opacity-70",
                            answer.isAccepted ? "text-[#CFE8D5]" : "text-zinc-600 hover:text-[#CFE8D5]"
                        )}
                    >
                        {isAccepting ? (
                            <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                            <Check className="size-3.5" strokeWidth={2.5} />
                        )}
                    </button>
                ) : answer.isAccepted ? (
                    <span title="Accepted branch" className="flex items-center text-[#CFE8D5]">
                        <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                ) : null}

                <button
                    type="button"
                    onClick={() => setCommentsOpen((v) => !v)}
                    disabled={interactionsDisabled}
                    className="flex items-center gap-1.5 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <MessageCircle className="size-3.5" />
                    {commentCount > 0 ? commentCount : "Comment"}
                </button>
            </div>

            {commentsOpen && (
                <div className="mt-4 border-t border-white/[0.05] pt-3">
                    <CommentsSection type="answer" typeId={answer.$id} />
                </div>
            )}

            <ConfirmDialog
                open={deleteDialogOpen}
                title="Delete this branch?"
                description="This permanently removes the branch and its comments. If it has its own branch replies, deletion will be blocked until those are removed first."
                confirmLabel={isDeleting ? "Deleting…" : "Delete branch"}
                destructive
                onCancel={() => setDeleteDialogOpen(false)}
                onConfirm={handleConfirmDelete}
                busy={isDeleting}
            />
        </article>
    );
}
