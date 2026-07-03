"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Check, CheckCircle2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { PositionedComment } from "@/hooks/useCodeComments";

const AVATAR_BG: Record<string, string> = {
    indigo: "bg-indigo-500",
    violet: "bg-violet-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    cyan: "bg-cyan-500",
};

interface Props {
    /** Root comment plus all its replies, in chronological order */
    thread: PositionedComment[];
    currentUserId: string;
    isHost: boolean;
    onReply: (body: string) => Promise<void>;
    onResolve: (resolved: boolean) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    onClose: () => void;
}

export function CommentThreadPopover({
    thread,
    currentUserId,
    isHost,
    onReply,
    onResolve,
    onDelete,
    onClose,
}: Props) {
    const [replyText, setReplyText] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const root = thread[0];
    const isResolved = !!root?.resolvedAt;
    const canResolve = root?.authorId === currentUserId || isHost;

    async function handleReply() {
        const body = replyText.trim();
        if (!body || submitting) return;
        setSubmitting(true);
        try {
            await onReply(body);
            setReplyText("");
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to post reply");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleResolveToggle() {
        try {
            await onResolve(!isResolved);
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to update comment");
        }
    }

    async function handleDelete(id: string) {
        try {
            await onDelete(id);
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to delete comment");
        }
    }

    if (!root) return null;

    return (
        <div className="w-[320px] rounded-xl border border-white/10 bg-[#17171b] shadow-2xl shadow-black/50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-1.5">
                    {isResolved ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#a7c8b3]" />
                    ) : (
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                    )}
                    <span className="text-[11px] font-semibold text-zinc-300">
                        {isResolved ? "Resolved" : "Open"} · Line {root.currentLine}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {canResolve && (
                        <button
                            onClick={handleResolveToggle}
                            title={isResolved ? "Reopen thread" : "Resolve thread"}
                            className="p-1 rounded-md hover:bg-white/[0.06] text-zinc-500 hover:text-[#a7c8b3] transition-colors"
                        >
                            <Check className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Thread */}
            <div className="max-h-[280px] overflow-y-auto px-3 py-2.5 space-y-3" style={{ scrollbarWidth: "thin" }}>
                {thread.map((c) => {
                    const canDelete = c.authorId === currentUserId || isHost;
                    const initials = c.authorName.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
                    return (
                        <div key={c.$id} className="flex items-start gap-2 group">
                            <div
                                className={cn(
                                    "shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                                    AVATAR_BG[c.authorColor] ?? "bg-zinc-600"
                                )}
                            >
                                {initials || "?"}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[12px] font-semibold text-zinc-200">{c.authorName}</span>
                                    <span className="text-[10px] text-zinc-600">
                                        {formatDistanceToNow(new Date(c.$createdAt), { addSuffix: true })}
                                    </span>
                                </div>
                                <p className="text-[13px] text-zinc-300 leading-snug whitespace-pre-wrap break-words mt-0.5">
                                    {c.body}
                                </p>
                            </div>
                            {canDelete && (
                                <button
                                    onClick={() => handleDelete(c.$id)}
                                    className="shrink-0 p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-rose-500/10 text-zinc-600 hover:text-rose-400 transition-all"
                                    title="Delete"
                                >
                                    <Trash2 className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Reply box */}
            {!isResolved && (
                <div className="border-t border-white/5 p-2 flex items-center gap-2">
                    <input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleReply();
                        }}
                        placeholder="Reply…"
                        className="flex-1 bg-white/[0.04] border border-white/5 rounded-lg px-2.5 py-1.5 text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#a7c8b3]/50"
                    />
                    <button
                        onClick={handleReply}
                        disabled={!replyText.trim() || submitting}
                        className="shrink-0 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-[#a7c8b3] text-[#08100b] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition-colors"
                    >
                        Send
                    </button>
                </div>
            )}
        </div>
    );
}
