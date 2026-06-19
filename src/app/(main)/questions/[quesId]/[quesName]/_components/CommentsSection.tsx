"use client";

import React from "react";
import Link from "next/link";
import {
    MessageCircle,
    Trash2,
    ThumbsUp,
    Reply,
    ImageIcon,
    Smile,
    MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { Author, CommentDoc, CommentTargetType, useQuestionDetail } from "./QuestionDetailContext";
import { Avatar, ConfirmDialog } from "./shared";

type HydratedComment = CommentDoc & { author: Author };
type ThreadedComment = HydratedComment & { replies: ThreadedComment[] };

// ─── Comment composer ─────────────────────────────────────────────────────────

function CommentComposer({
    currentUser,
    isPosting,
    value,
    onChange,
    onSubmit,
    onCancel,
    placeholder = "Add a comment…",
    compact = false,
}: {
    currentUser: { $id: string; name: string } | null;
    isPosting: boolean;
    value: string;
    onChange: (v: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    onCancel?: () => void;
    placeholder?: string;
    compact?: boolean;
}) {
    const [expanded, setExpanded] = React.useState(!compact);
    const inputRef = React.useRef<HTMLTextAreaElement>(null);

    const handleFocus = () => {
        if (compact) setExpanded(true);
    };

    if (!currentUser && compact) {
        return (
            <div className="flex items-center gap-2 py-3 text-sm text-zinc-600">
                <MessageCircle className="size-4" />
                <Link href="/login" className="text-green-500 hover:text-green-400 transition">
                    Sign in
                </Link>{" "}
                to join the discussion
            </div>
        );
    }

    return (
        <form onSubmit={onSubmit} className="py-4">
            <div className="flex items-start gap-3">
                {currentUser && <Avatar name={currentUser.name} />}

                <div className="min-w-0 flex-1 border border-white/10 rounded-xl bg-white/[0.02] p-2 flex items-center focus-within:border-white/20 transition-colors">
                    <textarea
                        ref={inputRef}
                        autoFocus={!compact}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        onFocus={handleFocus}
                        placeholder={placeholder}
                        maxLength={500}
                        rows={1}
                        className={cn(
                            "w-full resize-none bg-transparent px-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-500 h-6"
                        )}
                    />

                    <div className="flex items-center gap-2 shrink-0">

                        <button
                            type="button"
                            title="Attach image"
                            className="flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 transition"
                        >
                            <ImageIcon className="size-4" />
                        </button>
                        <button
                            type="submit"
                            disabled={isPosting || !value.trim()}
                            className="h-8 rounded-lg bg-white/[0.06] text-zinc-300 px-4 text-xs font-semibold hover:bg-white/[0.12] hover:text-white disabled:opacity-50 transition"
                        >
                            {isPosting ? "Posting…" : "Post"}
                        </button>
                    </div>
                </div>
            </div>
        </form>
    );
}

// ─── Single comment row ───────────────────────────────────────────────────────

function CommentRow({
    comment,
    onDelete,
    currentUserId,
    onReply,
    isReply = false,
    isAnswerAuthor = false,
}: {
    comment: CommentDoc & { author: { $id: string; name: string; reputation: number } };
    onDelete: () => void;
    currentUserId?: string;
    onReply: () => void;
    isReply?: boolean;
    isAnswerAuthor?: boolean;
}) {
    const [liked, setLiked] = React.useState(false);
    const [likeCount, setLikeCount] = React.useState(0);
    const isOwn = currentUserId === comment.authorId;

    return (
        <div
            className={cn(
                "group relative flex gap-3 py-4",
                isReply && "pl-11"
            )}
        >
            <Avatar name={comment.author.name} />

            <div className="min-w-0 flex-1">
                {/* Meta row */}
                <div className="flex items-center gap-2 text-xs">
                    <Link
                        href={`/users/${comment.authorId}/${slugify(comment.author.name)}`}
                        className="font-bold text-zinc-200 hover:text-white transition"
                    >
                        {comment.author.name}
                    </Link>
                    {isAnswerAuthor && (
                        <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] font-bold text-green-400 uppercase tracking-wide">
                            OP
                        </span>
                    )}
                    <span className="text-zinc-500 text-[10px]">·</span>
                    <span className="text-zinc-500">
                        {comment.optimistic
                            ? "Posting…"
                            : convertDateToRelativeTime(new Date(comment.$createdAt))}
                    </span>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 transition">
                        <MoreHorizontal className="size-4 text-zinc-600 hover:text-zinc-300 cursor-pointer" />
                    </div>
                </div>

                {/* Comment text */}
                <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">
                    {comment.content}
                </p>

                {/* Action row */}
                {!comment.isDeleted && (
                <div className="mt-2 flex items-center gap-4">
                    <button
                        onClick={() => {
                            setLiked(!liked);
                            setLikeCount((c) => (liked ? c - 1 : c + 1));
                        }}
                        className={cn(
                            "flex items-center gap-1.5 text-xs font-semibold transition",
                            liked ? "text-green-500" : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        <ThumbsUp className="size-4" fill={liked ? "currentColor" : "none"} />
                        {likeCount > 0 && <span>{likeCount}</span>}
                    </button>

                    <button
                        onClick={onReply}
                        className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-300 transition"
                    >
                        <Reply className="size-4" />
                        Reply
                    </button>

                    {isOwn && (
                        <button
                            onClick={onDelete}
                            className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-red-400 transition"
                            aria-label="Delete comment"
                        >
                            <Trash2 className="size-3.5" />
                        </button>
                    )}
                </div>
                )}
            </div>
        </div>
    );
}

// ─── CommentsSection ──────────────────────────────────────────────────────────

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
    } = useQuestionDetail();

    const [expanded, setExpanded] = React.useState(false);
    const [newComment, setNewComment] = React.useState("");
    const [isPosting, setIsPosting] = React.useState(false);
    const [commentToDelete, setCommentToDelete] = React.useState<HydratedComment | null>(null);
    const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
    const [replyText, setReplyText] = React.useState("");
    const [isPostingReply, setIsPostingReply] = React.useState(false);

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
        () => (expanded ? commentTree : sliceCommentTree(commentTree, INITIAL_SHOW)),
        [commentTree, expanded]
    );

    const visibleCount = React.useMemo(
        () => countThreadedComments(visibleComments),
        [visibleComments]
    );
    const hiddenCount = Math.max(comments.total - visibleCount, 0);
    const shouldShowToggle = expanded ? comments.total > INITIAL_SHOW : hiddenCount > 0;
    const answerAuthorId =
        type === "answer"
            ? answers.documents.find((a) => a.$id === typeId)?.authorId
            : null;

    const handlePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        setIsPosting(true);
        const posted = await addComment(type, typeId, newComment);
        setIsPosting(false);
        if (posted) {
            setNewComment("");
            setExpanded(true);
        }
    };

    const handlePostReply = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!replyText.trim() || !replyingTo) return;
        setIsPostingReply(true);
        const posted = await addComment(type, typeId, replyText, replyingTo);
        setIsPostingReply(false);
        if (posted) {
            setReplyText("");
            setReplyingTo(null);
            setExpanded(true);
        }
    };

    const handleDelete = async () => {
        if (!commentToDelete) return;
        const deleted = await deleteComment(type, typeId, commentToDelete.$id);
        if (deleted) setCommentToDelete(null);
    };

    const renderCommentThread = (
        thread: ThreadedComment[],
        isNested = false
    ): React.ReactNode =>
        thread.map((comment, index) => {
            const isAnswerAuthor = answerAuthorId === comment.authorId;
            const isReplyComposerOpen = replyingTo === comment.$id;
            const hasChildren = comment.replies.length > 0;
            const isLast = index === thread.length - 1;

            return (
                <div key={comment.$id} className="relative">
                    {/* If nested, draw the L-curve and the vertical line to the next sibling */}
                    {isNested && (
                        <>
                            <div
                                className="pointer-events-none absolute -left-6 top-0 w-6 border-b border-l border-white/[0.18] rounded-bl-xl"
                                style={{ height: "32px" }}
                            />
                            {!isLast && (
                                <div className="pointer-events-none absolute -left-6 top-[32px] bottom-0 w-px bg-white/[0.18]" />
                            )}
                        </>
                    )}

                    <div className="relative z-10">
                        {/* Parent drop line: only needed if there are children or composer */}
                        {(isReplyComposerOpen || hasChildren) && (
                            <div className="pointer-events-none absolute left-[16px] top-[48px] bottom-0 w-px bg-white/[0.18] z-0" />
                        )}
                        <CommentRow
                            comment={comment}
                            currentUserId={currentUser?.$id}
                            isAnswerAuthor={isAnswerAuthor}
                            onDelete={() => setCommentToDelete(comment)}
                            onReply={() => {
                                setReplyingTo(replyingTo === comment.$id ? null : comment.$id);
                                setReplyText(`@${comment.author?.name ?? "user"} `);
                            }}
                        />
                    </div>

                    {(isReplyComposerOpen || hasChildren) && (
                        <div className="ml-4 pl-6 relative z-0">
                            {/* Inline reply composer */}
                            {isReplyComposerOpen && (
                                <div className="relative pb-2">
                                    <div
                                        className="pointer-events-none absolute -left-6 top-0 w-6 border-b border-l border-white/[0.18] rounded-bl-xl"
                                        style={{ height: "32px" }}
                                    />
                                    {hasChildren && (
                                        <div className="pointer-events-none absolute -left-6 top-[32px] bottom-0 w-px bg-white/[0.18]" />
                                    )}
                                    <CommentComposer
                                        currentUser={currentUser}
                                        isPosting={isPostingReply}
                                        value={replyText}
                                        onChange={setReplyText}
                                        onSubmit={handlePostReply}
                                        onCancel={() => {
                                            setReplyingTo(null);
                                            setReplyText("");
                                        }}
                                        placeholder={`Reply to ${comment.author?.name ?? "user"}…`}
                                        compact={false}
                                    />
                                </div>
                            )}

                            {hasChildren && renderCommentThread(comment.replies, true)}
                        </div>
                    )}
                </div>
            );
        });

    return (
        <div className={cn("", className)}>
            {/* Comment list */}
            {visibleComments.length > 0 && (
                <div className="flex flex-col">
                    {renderCommentThread(visibleComments)}
                </div>
            )}

            {/* Show more / less */}
            {shouldShowToggle && (
                <button
                    onClick={() => setExpanded((v) => !v)}
                    className="mt-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition"
                >
                    {expanded
                        ? "Show fewer comments"
                        : `Show ${hiddenCount} more comment${hiddenCount !== 1 ? "s" : ""}`}
                </button>
            )}

            {/* Add comment composer */}
            {replyingTo === null && (
                <CommentComposer
                    currentUser={currentUser}
                    isPosting={isPosting}
                    value={newComment}
                    onChange={setNewComment}
                    onSubmit={handlePost}
                    placeholder={
                        currentUser ? "Add a comment..." : "Sign in to comment"
                    }
                    compact={comments.total > 0}
                />
            )}

            <ConfirmDialog
                open={Boolean(commentToDelete)}
                title="Delete this comment?"
                description="This removes the comment from the discussion."
                confirmLabel="Delete comment"
                destructive
                onCancel={() => setCommentToDelete(null)}
                onConfirm={handleDelete}
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
