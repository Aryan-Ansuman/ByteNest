"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { RoomMessage } from "@/types/rooms";
import { Reply, MoreHorizontal, Trash2, SmilePlus, Radio } from "lucide-react";
import { useRoomStore } from "@/store/roomStore";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
    indigo:  { bg: "bg-indigo-500",  text: "text-white" },
    violet:  { bg: "bg-violet-500",  text: "text-white" },
    emerald: { bg: "bg-emerald-500", text: "text-white" },
    amber:   { bg: "bg-amber-500",   text: "text-black" },
    rose:    { bg: "bg-rose-500",    text: "text-white" },
    cyan:    { bg: "bg-cyan-500",    text: "text-black" },
};

const QUICK_EMOJI = ["👍", "❤️", "😂", "🔥", "✅", "👀", "🎉", "💯"];

interface Props {
    message: RoomMessage;
    currentUserId: string;
    onReact: (messageId: string, emoji: string) => void;
    onReply: (message: RoomMessage) => void;
    parentMessage: RoomMessage | null;
    /** Compact mode: same author within 5 min — hides avatar + name */
    compact?: boolean;
}

export default function MessageBubble({
    message,
    currentUserId,
    onReact,
    onReply,
    parentMessage,
    compact = false,
}: Props) {
    const [hovering, setHovering] = useState(false);
    const isMe = message.authorId === currentUserId;
    const isTemp = message.$id.startsWith("temp-");
    const isSystem = message.type === "system";

    const reactions = (() => {
        try { return JSON.parse(message.reactions ?? "{}") as Record<string, string[]>; }
        catch { return {}; }
    })();
    const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

    async function handleDelete() {
        useRoomStore.getState().deleteMessage(message.$id);
        try {
            await apiFetch(`/api/rooms/${message.roomId}/messages/${message.$id}`, {
                method: "DELETE",
            });
        } catch {
            toast.error("Failed to delete message");
        }
    }

    const timestamp = (() => {
        try { return format(new Date(message.$createdAt), "h:mm a"); }
        catch { return ""; }
    })();

    if (isSystem) {
        return (
            <div className="flex justify-center py-3">
                <span className="flex items-center gap-1.5 text-[11px] font-[500] tracking-wide text-zinc-500 bg-white/5 rounded-full px-3 py-1">
                    {message.body}
                </span>
            </div>
        );
    }

    // ─── Normal message ───────────────────────────────────────────────────────
    const color = COLOR_MAP[message.authorColor] ?? { bg: "bg-zinc-700", text: "text-tx" };
    const initials = message.authorName
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");

    return (
        <div
            className={cn(
                "group px-3 py-0.5 hover:bg-zinc-800/15 transition-colors relative",
                isTemp ? "opacity-60" : "",
                compact ? "pt-0.5" : "pt-2"
            )}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
        >
            {/* Timestamp on hover for compact messages */}
            {compact && hovering && (
                <span className="absolute left-2 top-1 text-[10px] text-zinc-600 w-9 text-right tabular-nums select-none">
                    {timestamp}
                </span>
            )}

            {/* Reply context */}
            {parentMessage && (
                <div className="ml-9 mb-0.5 flex items-center gap-1.5 opacity-90 hover:opacity-100 transition-opacity">
                    <div className="w-5 border-t-2 border-l-2 border-[#a7c8b3]/40 h-3 rounded-tl-sm ml-1 shrink-0" />
                    <div className="text-[12px] truncate max-w-[280px] leading-4 flex items-center gap-1">
                        <span className="text-[#a7c8b3] font-semibold">{parentMessage.authorName}</span>
                        <span className="truncate text-zinc-400">{parentMessage.body}</span>
                    </div>
                </div>
            )}

            <div className="flex items-start gap-3">
                {/* Avatar — only shown on first message in group */}
                {!compact ? (
                    <div className={cn(
                        "shrink-0 w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold mt-0.5",
                        color.bg, color.text
                    )}>
                        {initials || "?"}
                    </div>
                ) : (
                    <div className="w-6 shrink-0" /> // spacer
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Author + time — only shown on first in group */}
                    {!compact && (
                        <div className="flex items-center mb-1 min-w-0">
                            <span className="text-[13px] font-[600] text-zinc-100 truncate shrink">
                                {message.authorName}
                            </span>
                            <div className="flex-1" />
                            {message.editedAt && (
                                <span className="text-[10px] text-zinc-500 font-[400] shrink-0 mr-1.5">
                                    (edited)
                                </span>
                            )}
                            <span className="text-[10px] text-zinc-500 font-[400] shrink-0">
                                {timestamp}
                            </span>
                        </div>
                    )}

                    {/* Body */}
                    <p className={cn(
                        "text-[14px] leading-relaxed break-words whitespace-pre-wrap",
                        message.deletedAt ? "text-zinc-600 italic" : "text-zinc-300"
                    )}>
                        {message.deletedAt ? "Message deleted" : message.body}
                    </p>

                    {/* Reactions */}
                    {reactionEntries.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {reactionEntries.map(([emoji, uids]) => {
                                const hasReacted = uids.includes(currentUserId);
                                return (
                                    <button
                                        key={emoji}
                                        onClick={() => onReact(message.$id, emoji)}
                                        className={cn(
                                            "flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-[12px] border transition-all duration-150 hover:bg-white/[0.03] active:scale-[1.01]",
                                            hasReacted
                                                ? "bg-[#a7c8b3]/10 border-[#a7c8b3]/20 text-[#a7c8b3]"
                                                : "bg-[#18181b] border-white/5 text-zinc-400 hover:text-zinc-200"
                                        )}
                                    >
                                        <span>{emoji}</span>
                                        <span className="font-[500] text-[10px]">{uids.length}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Hover actions */}
                <div className={cn(
                    "flex items-center gap-0.5 shrink-0 transition-opacity bg-[#18181b] border border-white/5 rounded-lg px-0.5 py-0.5 shadow-sm",
                    hovering && !message.deletedAt ? "opacity-100" : "opacity-0 pointer-events-none"
                )}>
                    {/* Quick react */}
                    <Popover>
                        <PopoverTrigger asChild>
                            <button className="p-1 rounded-md hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300 transition-all duration-150 hover:-translate-y-0.5 active:scale-95">
                                <SmilePlus className="w-3.5 h-3.5" />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            side="top"
                            align="end"
                            className="w-auto p-1.5 bg-[#18181b] border-white/5 shadow-xl rounded-xl"
                        >
                            <div className="flex gap-1">
                                {QUICK_EMOJI.map((e) => (
                                    <button
                                        key={e}
                                        onClick={() => onReact(message.$id, e)}
                                        className="text-base hover:scale-125 transition-transform px-1 py-0.5 rounded-md hover:bg-white/[0.03]"
                                    >
                                        {e}
                                    </button>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>

                    {/* Reply */}
                    <button
                        onClick={() => onReply(message)}
                        className="p-1 rounded-md hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300 transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                        aria-label="Reply"
                    >
                        <Reply className="w-3.5 h-3.5" />
                    </button>

                    {/* More */}
                    {isMe && !isTemp && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="p-1 rounded-md hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300 transition-all duration-150 hover:-translate-y-0.5 active:scale-95">
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="end"
                                className="bg-[#18181b] border border-white/5 text-xs min-w-[120px] rounded-[12px] p-1"
                            >
                                <DropdownMenuItem
                                    onClick={handleDelete}
                                    className="text-rose-500 focus:text-rose-400 focus:bg-rose-500/10 gap-2 cursor-pointer rounded-md"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete message
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>
        </div>
    );
}
