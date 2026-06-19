"use client";

import React from "react";
import Link from "next/link";
import {
    MessageCircle,
    Send,
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
import { CommentDoc, CommentTargetType, useQuestionDetail } from "./QuestionDetailContext";
import { Avatar, ConfirmDialog } from "./shared";

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
                            title="Emoji"
                            className="flex size-8 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 transition"
                        >
                            <Smile className="size-4" />
                        </button>
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
                            className="h-8 rounded-lg bg-green-500/10 text-green-500 px-4 text-xs font-semibold hover:bg-green-500/20 disabled:opacity-50 transition"
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
    const [commentToDelete, setCommentToDelete] = React.useState<CommentDoc | null>(null);
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

    // Sort oldest first
    const sortedComments = [...comments.documents].sort(
        (a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime()
    );

    // Build threaded list
    const threadedComments: (typeof sortedComments[0] & { isReplyObj?: boolean })[] = [];
    const placedIds = new Set<string>();

    sortedComments.forEach((comment) => {
        if (placedIds.has(comment.$id)) return;

        threadedComments.push(comment);
        placedIds.add(comment.$id);

        // Find replies to this comment (mentions author)
        const replies = sortedComments.filter(
            (c) => !placedIds.has(c.$id) && c.content.includes(`@${comment.author.name}`)
        );

        replies.forEach((reply) => {
            threadedComments.push({ ...reply, isReplyObj: true });
            placedIds.add(reply.$id);
        });
    });

    const INITIAL_SHOW = 3;
    const visibleComments = expanded
        ? threadedComments
        : threadedComments.slice(0, INITIAL_SHOW);

    const hiddenCount = comments.total - INITIAL_SHOW;

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
        const posted = await addComment(type, typeId, replyText);
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

    return (
        <div className={cn("", className)}>
            {/* Comment list */}
            {visibleComments.length > 0 && (
                <div className="flex flex-col">
                    {visibleComments.map((comment) => {
                        const isReply = comment.isReplyObj || false;
                        const answerAuthorId = type === "answer" ? answers.documents.find((a) => a.$id === typeId)?.authorId : null;
                        const isAnswerAuthor = answerAuthorId === comment.authorId;
                        return (
                        <React.Fragment key={comment.$id}>
                            <CommentRow
                                comment={comment as any}
                                currentUserId={currentUser?.$id}
                                isReply={isReply}
                                isAnswerAuthor={isAnswerAuthor}
                                onDelete={() => setCommentToDelete(comment as any)}
                                onReply={() => {
                                    setReplyingTo(
                                        replyingTo === comment.$id ? null : comment.$id
                                    );
                                    setReplyText(
                                        `@${(comment as any).author?.name ?? "user"} `
                                    );
                                }}
                            />

                            {/* Inline reply composer */}
                            {replyingTo === comment.$id && (
                                <div className="pb-2 pl-11">
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
                                        placeholder={`Reply to ${(comment as any).author?.name ?? "user"}…`}
                                        compact={false}
                                    />
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
                </div>
            )}

            {/* Show more / less */}
            {comments.total > INITIAL_SHOW && (
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
