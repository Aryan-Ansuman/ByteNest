"use client";

import React from "react";
import Link from "next/link";
import { CornerDownRight, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { Author, CommentDoc, CommentTargetType, useQuestionDetail } from "./QuestionDetailContext";
import { Avatar, ConfirmDialog } from "./shared";

type HydratedComment = CommentDoc & { author: Author };
type ThreadedComment = HydratedComment & { replies: ThreadedComment[] };

// ─── Thread layout constants ───────────────────────────────────────────────

const INDENT_PX = 13;
const RAIL_OFFSET_PX = 20;
const MAX_VISUAL_DEPTH = 4; // depths 0..4 render inline; depth 4's children collapse behind "View more replies"

// ─── Shared context passed down the recursive tree ─────────────────────────

interface ThreadCtx {
    currentUser: { $id: string; name: string } | null;
    answerAuthorId?: string | null;
    isDeletingQuestion: boolean;
    replyingTo: string | null;
    setReplyingTo: (id: string | null) => void;
    replyText: string;
    setReplyText: (v: string) => void;
    isPostingReply: boolean;
    handlePostReply: (e: React.FormEvent) => void;
    onRequestDelete: (comment: HydratedComment) => void;
    collapsedIds: Set<string>;
    toggleCollapsed: (id: string) => void;
    continuedIds: Set<string>;
    onContinue: (id: string) => void;
}

// ─── Inline composer (root + reply) ────────────────────────────────────────

function InlineComposer({
    currentUser,
    isPosting,
    value,
    onChange,
    onSubmit,
    onCancel,
    placeholder = "Add a comment…",
    submitLabel = "Post",
    disabled = false,
}: {
    currentUser: { $id: string; name: string } | null;
    isPosting: boolean;
    value: string;
    onChange: (v: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    onCancel?: () => void;
    placeholder?: string;
    submitLabel?: string;
    disabled?: boolean;
}) {
    const inputRef = React.useRef<HTMLTextAreaElement>(null);
    const charsRemaining = 500 - value.length;

    React.useEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        input.style.height = "auto";
        input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    }, [value]);

    if (!currentUser) {
        return (
            <div className="flex items-center gap-2 py-2 text-[12.5px] text-zinc-600">
                <Link href="/login" className="font-medium text-[#CFE8D5] transition hover:text-white">
                    Sign in
                </Link>{" "}
                to join the discussion
            </div>
        );
    }

    return (
        <form onSubmit={onSubmit} className="flex items-start gap-2.5 py-1.5">
            <Avatar name={currentUser.name} small />

            <div className="min-w-0 flex-1">
                <textarea
                    ref={inputRef}
                    autoFocus
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape" && onCancel) {
                            e.preventDefault();
                            onCancel();
                        }
                    }}
                    placeholder={placeholder}
                    maxLength={500}
                    rows={1}
                    disabled={disabled || isPosting}
                    className="max-h-40 min-h-[28px] w-full resize-none border-b border-white/5 bg-transparent py-1 text-[13px] leading-relaxed text-zinc-200 outline-none transition placeholder:text-zinc-500 focus:border-white/25 disabled:cursor-not-allowed disabled:opacity-60"
                />

                <div className="mt-1.5 flex items-center justify-between gap-3">
                    <span
                        className={cn(
                            "text-[10.5px]",
                            charsRemaining < 50 ? "text-amber-400" : "text-zinc-600"
                        )}
                    >
                        {value.length}/500
                    </span>

                    <div className="flex shrink-0 items-center gap-2">
                        {onCancel && (
                            <button
                                type="button"
                                onClick={onCancel}
                                disabled={disabled || isPosting}
                                className="text-[11.5px] font-medium text-zinc-500 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                Cancel
                            </button>
                        )}

                        <button
                            type="submit"
                            disabled={disabled || isPosting || !value.trim()}
                            className="rounded-md bg-white/[0.08] px-3 py-1 text-[11.5px] font-semibold text-zinc-200 transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isPosting ? "Posting…" : submitLabel}
                        </button>
                    </div>
                </div>
            </div>
        </form>
    );
}

// ─── Single comment line (compact, no card) ────────────────────────────────

function CommentLine({
    comment,
    isOwn,
    isAnswerAuthor,
    isCollapsed,
    hasReplies,
    descendantCount,
    onToggleCollapse,
    onReply,
    onDelete,
    disabled,
    isReplyComposerOpen,
}: {
    comment: HydratedComment;
    isOwn: boolean;
    isAnswerAuthor: boolean;
    isCollapsed: boolean;
    hasReplies: boolean;
    descendantCount: number;
    onToggleCollapse: () => void;
    onReply: () => void;
    onDelete: () => void;
    disabled: boolean;
    isReplyComposerOpen: boolean;
}) {
    return (
        <div className="group relative py-1.5">
            {/* Drop line from bottom of Avatar down to Action Row toggle */}
            {!isCollapsed && (hasReplies || isReplyComposerOpen) && (
                <div 
                    className="absolute border-l-2 border-[color:var(--thread-rail)]"
                    style={{ left: '13px', top: '34px', bottom: '0', zIndex: 0 }}
                />
            )}

            {/* Header */}
            <div className="relative z-10 flex items-center gap-2.5">
                {isCollapsed ? (
                    <button
                        type="button"
                        onClick={onToggleCollapse}
                        className="flex shrink-0 size-7 items-center justify-center rounded-full border border-[color:var(--thread-rail)] bg-[#0c0c0c] text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
                        aria-label="Expand comment"
                    >
                        <Plus className="size-3.5" />
                    </button>
                ) : (
                    <Avatar name={comment.author.name} small />
                )}
                
                <div className="flex items-center gap-1.5 text-xs">
                    <Link
                        href={`/users/${comment.authorId}/${slugify(comment.author.name)}`}
                        className="font-semibold text-zinc-200 transition hover:text-white"
                    >
                        {comment.author.name}
                    </Link>
                    {isAnswerAuthor && (
                        <span className="rounded bg-[#CFE8D5]/10 px-1 py-0.5 text-[9px] font-bold text-[#CFE8D5] uppercase tracking-wide">
                            OP
                        </span>
                    )}
                    <span className="text-zinc-600">·</span>
                    <span className="text-zinc-500">
                        {comment.optimistic
                            ? "Posting…"
                            : convertDateToRelativeTime(new Date(comment.$createdAt))}
                    </span>
                    {isCollapsed && descendantCount > 0 && (
                        <>
                            <span className="text-zinc-600">·</span>
                            <span className="text-zinc-500 italic">
                                {descendantCount} {descendantCount === 1 ? "reply" : "replies"}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {!isCollapsed && (
                <>
                    {/* Content Text */}
                    <div className="mt-0.5 ml-[38px] relative z-10">
                        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">
                            {comment.content}
                        </p>
                    </div>

                    {/* Action Row */}
                    {(hasReplies || !comment.isDeleted) && (
                        <div className="mt-1.5 flex items-center gap-2.5 relative z-10">
                            {/* Toggle / Spacer Container (w=28px to match Avatar) */}
                            <div className="flex w-[28px] shrink-0 justify-center">
                                {hasReplies && (
                                    <button
                                        type="button"
                                        onClick={onToggleCollapse}
                                        className="flex size-[18px] items-center justify-center rounded-full border border-[color:var(--thread-rail)] bg-[#0c0c0c] text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-300"
                                        aria-label="Collapse comment"
                                    >
                                        <Minus className="size-2.5" />
                                    </button>
                                )}
                            </div>

                            {/* Actions */}
                            {!comment.isDeleted && (
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={onReply}
                                        className="text-[11.5px] font-semibold text-zinc-500 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Reply
                                    </button>
                                    {isOwn && (
                                        <button
                                            type="button"
                                            disabled={disabled}
                                            onClick={onDelete}
                                            className="text-[11.5px] font-semibold text-zinc-600 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Recursive thread node ──────────────────────────────────────────────────

function CommentThreadNode({
    comment,
    depth,
    ctx,
}: {
    comment: ThreadedComment;
    depth: number;
    ctx: ThreadCtx;
}) {
    const isOwn = ctx.currentUser?.$id === comment.authorId;
    const isAnswerAuthor = ctx.answerAuthorId === comment.authorId;
    const isCollapsed = ctx.collapsedIds.has(comment.$id);
    const hasReplies = comment.replies.length > 0;
    const descendantCount = countThreadedComments(comment.replies);
    const isReplyComposerOpen = ctx.replyingTo === comment.$id;
    const isContinued = ctx.continuedIds.has(comment.$id);
    const atDepthCap = depth >= MAX_VISUAL_DEPTH && !isContinued;
    const childDepth = Math.min(depth + 1, MAX_VISUAL_DEPTH);

    return (
        <div className="relative">
            <CommentLine
                comment={comment}
                isOwn={isOwn}
                isAnswerAuthor={isAnswerAuthor}
                isCollapsed={isCollapsed}
                hasReplies={hasReplies}
                descendantCount={descendantCount}
                onToggleCollapse={() => ctx.toggleCollapsed(comment.$id)}
                onReply={() => {
                    if (ctx.isDeletingQuestion) return;
                    if (ctx.replyingTo === comment.$id) {
                        ctx.setReplyingTo(null);
                        ctx.setReplyText("");
                        return;
                    }
                    ctx.setReplyingTo(comment.$id);
                    ctx.setReplyText(`@${comment.author?.name ?? "user"} `);
                }}
                onDelete={() => ctx.onRequestDelete(comment)}
                disabled={ctx.isDeletingQuestion}
                isReplyComposerOpen={isReplyComposerOpen}
            />

            {!isCollapsed && (hasReplies || isReplyComposerOpen) && (
                <div className="relative">
                    {/* Render Composer first if open */}
                    {isReplyComposerOpen && (
                        <div className="relative pt-1 pb-1">
                            <span
                                aria-hidden
                                className="absolute top-0 rounded-bl-[10px] border-b-2 border-l-2 border-[color:var(--thread-rail)]"
                                style={{ width: RAIL_OFFSET_PX, height: '20px', left: INDENT_PX }}
                            />
                            {/* If there are replies after, draw a vertical line connecting down */}
                            {hasReplies && (
                                <span
                                    aria-hidden
                                    className="absolute border-l-2 border-[color:var(--thread-rail)]"
                                    style={{ top: '0', bottom: 0, left: INDENT_PX }}
                                />
                            )}
                            <div className="relative z-10" style={{ paddingLeft: INDENT_PX + RAIL_OFFSET_PX }}>
                                <InlineComposer
                                    currentUser={ctx.currentUser}
                                    isPosting={ctx.isPostingReply}
                                    value={ctx.replyText}
                                    onChange={ctx.setReplyText}
                                    onSubmit={ctx.handlePostReply}
                                    onCancel={() => {
                                        ctx.setReplyingTo(null);
                                        ctx.setReplyText("");
                                    }}
                                    placeholder={`Reply to ${comment.author?.name ?? "user"}…`}
                                    submitLabel="Reply"
                                    disabled={ctx.isDeletingQuestion}
                                />
                            </div>
                        </div>
                    )}

                    {/* Render Replies */}
                    {hasReplies && (
                        atDepthCap ? (
                            <div className="relative pt-0.5 pb-0.5">
                                <span
                                    aria-hidden
                                    className="absolute top-0 rounded-bl-[10px] border-b-2 border-l-2 border-[color:var(--thread-rail)]"
                                    style={{ width: RAIL_OFFSET_PX, height: '20px', left: INDENT_PX }}
                                />
                                <div className="relative z-10" style={{ paddingLeft: INDENT_PX + RAIL_OFFSET_PX }}>
                                    <button
                                        type="button"
                                        onClick={() => ctx.onContinue(comment.$id)}
                                        className="flex items-center gap-1.5 py-1.5 text-[12.5px] font-medium text-[#8fb89c] transition hover:text-[#a7c8b3]"
                                    >
                                        <CornerDownRight className="size-3.5" />
                                        View {comment.replies.length} direct{" "}
                                        {comment.replies.length === 1 ? "reply" : "replies"}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            comment.replies.map((child, index) => {
                                const isLast = index === comment.replies.length - 1;
                                return (
                                    <div key={child.$id} className="relative pt-0.5">
                                        <span
                                            aria-hidden
                                            className="absolute top-0 rounded-bl-[10px] border-b-2 border-l-2 border-[color:var(--thread-rail)]"
                                            style={{ width: RAIL_OFFSET_PX, height: '20px', left: INDENT_PX }}
                                        />
                                        {!isLast && (
                                            <span
                                                aria-hidden
                                                className="absolute border-l-2 border-[color:var(--thread-rail)]"
                                                style={{ top: '0', bottom: 0, left: INDENT_PX }}
                                            />
                                        )}
                                        <div className="relative z-10" style={{ paddingLeft: INDENT_PX + RAIL_OFFSET_PX }}>
                                            <CommentThreadNode comment={child} depth={childDepth} ctx={ctx} />
                                        </div>
                                    </div>
                                );
                            })
                        )
                    )}
                </div>
            )}
        </div>
    );
}

// ─── CommentsSection ─────────────────────────────────────────────────────────

export default function CommentsSection({
    type,
    typeId,
    className,
}: {
    type: CommentTargetType;
    typeId: string;
    className?: string;
}) {
    const {
        answers,
        questionComments,
        currentUser,
        addComment,
        deleteComment,
        isDeletingQuestion,
    } = useQuestionDetail();

    const [expandedRoot, setExpandedRoot] = React.useState(false);
    const [newComment, setNewComment] = React.useState("");
    const [isPosting, setIsPosting] = React.useState(false);
    const [commentToDelete, setCommentToDelete] = React.useState<HydratedComment | null>(null);
    const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
    const [replyText, setReplyText] = React.useState("");
    const [isPostingReply, setIsPostingReply] = React.useState(false);
    const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set());
    const [continuedIds, setContinuedIds] = React.useState<Set<string>>(new Set());
    const composerId = `comment-composer-${type}-${typeId}`;

    const comments =
        type === "question"
            ? questionComments
            : answers.documents.find((a) => a.$id === typeId)?.comments ?? {
                  total: 0,
                  documents: [],
              };

    const INITIAL_SHOW = 3;
    const commentTree = React.useMemo(
        () => buildCommentTree(comments.documents as HydratedComment[]),
        [comments.documents]
    );
    const visibleComments = React.useMemo(
        () => (expandedRoot ? commentTree : sliceCommentTree(commentTree, INITIAL_SHOW)),
        [commentTree, expandedRoot]
    );
    const visibleCount = React.useMemo(
        () => countThreadedComments(visibleComments),
        [visibleComments]
    );
    const hiddenCount = Math.max(comments.total - visibleCount, 0);
    const shouldShowToggle = expandedRoot ? comments.total > INITIAL_SHOW : hiddenCount > 0;
    const answerAuthorId =
        type === "answer"
            ? answers.documents.find((a) => a.$id === typeId)?.authorId
            : null;

    const toggleCollapsed = React.useCallback((id: string) => {
        setCollapsedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleContinue = React.useCallback((id: string) => {
        setContinuedIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
    }, []);

    const handlePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isDeletingQuestion || !newComment.trim()) return;
        setIsPosting(true);
        const posted = await addComment(type, typeId, newComment);
        setIsPosting(false);
        if (posted) {
            setNewComment("");
            setExpandedRoot(true);
        }
    };

    const handlePostReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isDeletingQuestion || !replyText.trim() || !replyingTo) return;
        setIsPostingReply(true);
        const posted = await addComment(type, typeId, replyText, replyingTo);
        setIsPostingReply(false);
        if (posted) {
            setReplyText("");
            setReplyingTo(null);
            setExpandedRoot(true);
        }
    };

    const handleDelete = async () => {
        if (isDeletingQuestion || !commentToDelete) return;
        const deleted = await deleteComment(type, typeId, commentToDelete.$id);
        if (deleted) setCommentToDelete(null);
    };

    const ctx: ThreadCtx = {
        currentUser,
        answerAuthorId,
        isDeletingQuestion,
        replyingTo,
        setReplyingTo,
        replyText,
        setReplyText,
        isPostingReply,
        handlePostReply,
        onRequestDelete: (comment) => setCommentToDelete(comment),
        collapsedIds,
        toggleCollapsed,
        continuedIds,
        onContinue: handleContinue,
    };

    return (
        <div className={cn("", className)}>
            {visibleComments.length > 0 && (
                <div className="flex flex-col">
                    {visibleComments.map((comment) => (
                        <CommentThreadNode key={comment.$id} comment={comment} depth={0} ctx={ctx} />
                    ))}
                </div>
            )}

            {shouldShowToggle && (
                <button
                    onClick={() => setExpandedRoot((v) => !v)}
                    className="mt-2 text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
                >
                    {expandedRoot
                        ? "Show fewer comments"
                        : `Show ${hiddenCount} more comment${hiddenCount !== 1 ? "s" : ""}`}
                </button>
            )}

            {replyingTo === null && (
                <div id={composerId}>
                    <InlineComposer
                        currentUser={currentUser}
                        isPosting={isPosting}
                        value={newComment}
                        onChange={setNewComment}
                        onSubmit={handlePost}
                        placeholder={
                            isDeletingQuestion
                                ? "Question is being deleted..."
                                : currentUser
                                ? "Add a comment..."
                                : "Sign in to comment"
                        }
                        submitLabel="Post"
                        disabled={isDeletingQuestion}
                    />
                </div>
            )}

            <ConfirmDialog
                open={Boolean(commentToDelete)}
                title="Delete this comment?"
                description="This removes the comment from the discussion."
                confirmLabel="Delete comment"
                destructive
                onCancel={() => setCommentToDelete(null)}
                onConfirm={handleDelete}
                busy={isDeletingQuestion}
            />
        </div>
    );
}

function buildCommentTree(comments: HydratedComment[]): ThreadedComment[] {
    const sortedComments = [...comments].sort(
        (a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
    );
    const nodesById = new Map<string, ThreadedComment>(
        sortedComments.map((comment) => [comment.$id, { ...comment, replies: [] }])
    );
    const parentById = new Map(
        sortedComments.map((comment) => [comment.$id, comment.parentId ?? null])
    );
    const roots: ThreadedComment[] = [];

    for (const comment of sortedComments) {
        const node = nodesById.get(comment.$id);
        if (!node) continue;

        const parentId = comment.parentId ?? null;
        const parent = parentId ? nodesById.get(parentId) : null;

        if (
            parent &&
            parentId &&
            parentId !== comment.$id &&
            !wouldCreateCommentCycle(comment.$id, parentId, parentById)
        ) {
            parent.replies.push(node);
        } else {
            roots.push(node);
        }
    }

    return roots;
}

function wouldCreateCommentCycle(
    commentId: string,
    parentId: string,
    parentById: Map<string, string | null>
) {
    let currentId: string | null = parentId;
    const visited = new Set<string>();

    while (currentId) {
        if (currentId === commentId || visited.has(currentId)) return true;
        visited.add(currentId);
        currentId = parentById.get(currentId) ?? null;
    }

    return false;
}

function sliceCommentTree(comments: ThreadedComment[], limit: number): ThreadedComment[] {
    let remaining = limit;

    const visit = (nodes: ThreadedComment[]): ThreadedComment[] => {
        const visible: ThreadedComment[] = [];

        for (const node of nodes) {
            if (remaining <= 0) break;
            remaining -= 1;
            visible.push({ ...node, replies: visit(node.replies) });
        }

        return visible;
    };

    return visit(comments);
}

function countThreadedComments(comments: ThreadedComment[]): number {
    return comments.reduce(
        (total, comment) => total + 1 + countThreadedComments(comment.replies),
        0
    );
}
