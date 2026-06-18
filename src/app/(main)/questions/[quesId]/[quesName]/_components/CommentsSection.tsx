"use client";

import React from "react";
import Link from "next/link";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { CommentDoc, CommentTargetType, useQuestionDetail } from "./QuestionDetailContext";
import { Avatar, ConfirmDialog } from "./shared";

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
    const [showInput, setShowInput] = React.useState(false);
    const [newComment, setNewComment] = React.useState("");
    const [isPosting, setIsPosting] = React.useState(false);
    const [commentToDelete, setCommentToDelete] = React.useState<CommentDoc | null>(null);

    const comments =
        type === "question"
            ? questionComments
            : answers.documents.find((answer) => answer.$id === typeId)?.comments ?? { total: 0, documents: [] };

    const visibleComments = expanded ? comments.documents : comments.documents.slice(0, 2);

    const handlePost = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!newComment.trim()) return;

        setIsPosting(true);
        const posted = await addComment(type, typeId, newComment);
        setIsPosting(false);

        if (posted) {
            setNewComment("");
            setShowInput(false);
            setExpanded(true);
        }
    };

    const handleDelete = async () => {
        if (!commentToDelete) return;
        const deleted = await deleteComment(type, typeId, commentToDelete.$id);
        if (deleted) setCommentToDelete(null);
    };

    return (
        <div className={cn("rounded-xl border border-white/[0.06] bg-black/20 p-4", className)}>
            {visibleComments.length > 0 ? (
                visibleComments.map((comment) => (
                    <div
                        key={comment.$id}
                        className="group flex items-start gap-3 border-b border-white/[0.05] py-3 first:pt-0 last:border-0 last:pb-0"
                    >
                        <Avatar name={comment.author?.name || "User"} small />
                        <p className="min-w-0 flex-1 text-sm leading-relaxed text-zinc-400">
                            {comment.content}{" "}
                            <Link
                                href={`/users/${comment.authorId}/${slugify(comment.author?.name || "user")}`}
                                className="font-medium text-[#CFE8D5]/80 hover:text-[#CFE8D5]"
                            >
                                {comment.author?.name || "User"}
                            </Link>{" "}
                            <span className="text-zinc-600">
                                {comment.optimistic
                                    ? "Posting..."
                                    : convertDateToRelativeTime(new Date(comment.$createdAt))}
                            </span>
                        </p>
                        {currentUser?.$id === comment.authorId ? (
                            <button
                                onClick={() => setCommentToDelete(comment)}
                                aria-label="Delete comment"
                                className="shrink-0 text-zinc-700 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                            >
                                <Trash2 className="size-3.5" />
                            </button>
                        ) : null}
                    </div>
                ))
            ) : (
                <p className="text-sm text-zinc-600">No discussion yet.</p>
            )}

            {comments.total > 2 ? (
                <button
                    onClick={() => setExpanded((value) => !value)}
                    className="mt-2 text-xs text-zinc-600 transition hover:text-zinc-300"
                >
                    {expanded
                        ? "Show less"
                        : `Show ${comments.total - 2} more comment${comments.total - 2 === 1 ? "" : "s"}`}
                </button>
            ) : null}

            {showInput ? (
                <form onSubmit={handlePost} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                        autoFocus
                        value={newComment}
                        onChange={(event) => setNewComment(event.target.value)}
                        placeholder="Add a comment..."
                        className="min-h-9 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#CFE8D5]/35"
                        maxLength={500}
                    />
                    <button
                        type="submit"
                        disabled={isPosting || !newComment.trim()}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-3 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2] disabled:opacity-50"
                    >
                        <Send className="size-3.5" />
                        {isPosting ? "Posting..." : "Post"}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowInput(false)}
                        className="h-9 rounded-xl border border-white/[0.08] px-3 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200"
                    >
                        Cancel
                    </button>
                </form>
            ) : (
                <button
                    onClick={() => setShowInput(true)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-600 transition hover:text-zinc-300"
                >
                    <MessageCircle className="size-3.5" />
                    {currentUser ? "Add comment" : "Log in to comment"}
                </button>
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
