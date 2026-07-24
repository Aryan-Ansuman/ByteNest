"use client";

import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import type { RoomMessage } from "@/types/rooms";
import { Reply, MoreHorizontal, Trash2, SmilePlus, Pencil, Check, X, Pin, PinOff } from "lucide-react";
import { useRoomStore } from "@/store/roomStore";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
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

/**
 * System messages are plain neutral text by default. Socratic Debugging
 * Mode messages get a content-based style override: in-session
 * (start/end) messages read amber, conclusion (root cause) messages read
 * the brand green. Matched by prefix/substring rather than a dedicated
 * message subtype, since system messages don't carry structured metadata.
 */
function getSystemMessageStyle(body: string): "amber" | "green" | "default" {
    if (body.startsWith("💡") || body.startsWith("✅ Root cause") || body.includes("Root cause recorded")) {
        return "green";
    }
    if (body.startsWith("🔍") || body.includes("Socratic Debugging Mode")) {
        return "amber";
    }
    return "default";
}

interface Props {
    message: RoomMessage;
    currentUserId: string;
    onReact: (messageId: string, emoji: string) => void;
    onReply: (message: RoomMessage) => void;
    parentMessage: RoomMessage | null;
    /** Compact mode: same author within 5 min — hides avatar + name */
    compact?: boolean;
    /** Highlight this message (e.g. from search) */
    highlight?: boolean;
    /** Host-only pin/unpin handler */
    onPin?: (messageId: string) => void;
    isHost?: boolean;
    isPinned?: boolean;
}

export default function MessageBubble({
    message,
    currentUserId,
    onReact,
    onReply,
    parentMessage,
    compact = false,
    highlight = false,
    onPin,
    isHost = false,
    isPinned = false,
}: Props) {
    const [hovering, setHovering] = useState(false);
    const [editing, setEditing]   = useState(false);
    const [editValue, setEditValue] = useState(message.body);
    const [saving, setSaving]     = useState(false);
    const editRef = useRef<HTMLTextAreaElement>(null);

    const updateMessage = useRoomStore((s) => s.updateMessage);

    const isMe     = message.authorId === currentUserId;
    const isTemp   = message.$id.startsWith("temp-");
    const isSystem = message.type === "system";
    const isQuestion = message.type === "question";

    const reactions = (() => {
        try { return JSON.parse(message.reactions ?? "{}") as Record<string, string[]>; }
        catch { return {}; }
    })();
    const reactionEntries = Object.entries(reactions).filter(([, users]) => users.length > 0);

    // Focus textarea when editing starts
    useEffect(() => {
        if (editing) {
            const el = editRef.current;
            if (el) {
                el.focus();
                el.setSelectionRange(el.value.length, el.value.length);
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
            }
        }
    }, [editing]);

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

    function startEdit() {
        setEditValue(message.body);
        setEditing(true);
    }

    function cancelEdit() {
        setEditing(false);
        setEditValue(message.body);
    }

    async function submitEdit() {
        const trimmed = editValue.trim();
        if (!trimmed || trimmed === message.body) { cancelEdit(); return; }
        setSaving(true);
        try {
            const res = await apiFetch<{ message: RoomMessage }>(
                `/api/rooms/${message.roomId}/messages/${message.$id}`,
                { method: "PATCH", body: JSON.stringify({ body: trimmed }) }
            );
            updateMessage(res.message);
            setEditing(false);
        } catch {
            toast.error("Failed to edit message");
        } finally {
            setSaving(false);
        }
    }

    function handleEditKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); }
        if (e.key === "Escape") { cancelEdit(); }
    }

    const timestamp = (() => {
        try { return format(new Date(message.$createdAt), "h:mm a"); }
        catch { return ""; }
    })();

    if (isSystem) {
        const style = getSystemMessageStyle(message.body);
        return (
            <div className="flex justify-center py-3">
                <span
                    className={cn(
                        "flex items-center gap-1.5 text-[11px] font-[500] tracking-wide rounded-full px-3 py-1",
                        style === "amber"
                            ? "text-amber-300 bg-amber-500/10 border border-amber-500/20"
                            : style === "green"
                                ? "text-[#a7c8b3] bg-[#a7c8b3]/10 border border-[#a7c8b3]/20"
                                : "text-zinc-500 bg-white/5"
                    )}
                >
                    {message.body}
                </span>
            </div>
        );
    }

    const color = COLOR_MAP[message.authorColor] ?? { bg: "bg-zinc-700", text: "text-tx" };
    const initials = message.authorName
        .split(" ").slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "").join("");

    // Parse body for @mentions highlighting
    function renderBody(text: string) {
        const parts = text.split(/(@\w[\w\d_-]*)/g);
        return parts.map((part, i) =>
            part.startsWith("@") ? (
                <span key={i} className="text-[#a7c8b3] font-semibold">{part}</span>
            ) : (
                <span key={i}>{part}</span>
            )
        );
    }

    return (
        <div
            className={cn(
                "group px-3 py-0.5 hover:bg-zinc-800/15 transition-colors relative",
                isTemp ? "opacity-60" : "",
                compact ? "pt-0.5" : "pt-2",
                highlight ? "bg-[#a7c8b3]/5 border-l-2 border-[#a7c8b3]/50" : ""
            )}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
        >
            {/* Left accent stripe — amber for Socratic questions, subtle grey otherwise */}
            <span
                className={cn(
                    "absolute left-0 top-0.5 bottom-0.5 w-[3px] rounded-full transition-colors",
                    isQuestion ? "bg-amber-500/60" : "bg-zinc-700/40"
                )}
            />

            {/* Socratic question badge */}
            {isQuestion && (
                <span
                    title={`Socratic question — ${message.authorName} is helping without giving the answer.`}
                    className="absolute right-3 top-1 z-[1] pointer-events-none flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[10px] font-bold select-none"
                >
                    ?
                </span>
            )}

            {/* Timestamp on hover for compact */}
            {compact && hovering && (
                <span className="absolute left-2 top-1 text-[10px] text-zinc-600 w-9 text-right tabular-nums select-none">
                    {timestamp}
                </span>
            )}

            {/* Reply context */}
            {parentMessage && (
                <div className="ml-9 mb-0.5 flex items-center gap-1.5 opacity-90">
                    <div className="w-5 border-t-2 border-l-2 border-[#a7c8b3]/40 h-3 rounded-tl-sm ml-1 shrink-0" />
                    <div className="text-[12px] truncate max-w-[280px] leading-4 flex items-center gap-1">
                        <span className="text-[#a7c8b3] font-semibold">{parentMessage.authorName}</span>
                        <span className="truncate text-zinc-400">{parentMessage.body}</span>
                    </div>
                </div>
            )}

            <div className="flex items-start gap-3">
                {/* Avatar */}
                {!compact ? (
                    <div className={cn(
                        "shrink-0 w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold mt-0.5",
                        color.bg, color.text
                    )}>
                        {initials || "?"}
                    </div>
                ) : (
                    <div className="w-6 shrink-0" />
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {!compact && (
                        <div className="flex items-center mb-1 min-w-0">
                            <span className="text-[13px] font-[600] text-zinc-100 truncate shrink">
                                {message.authorName}
                            </span>
                            {isPinned && (
                                <span className="flex items-center gap-0.5 ml-1.5 px-1.5 py-0.5 rounded-full bg-[#a7c8b3]/10 text-[#a7c8b3] text-[9px] font-semibold shrink-0">
                                    <Pin className="w-2.5 h-2.5" />
                                    Pinned
                                </span>
                            )}
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

                    {/* Body or inline editor */}
                    {editing ? (
                        <div className="space-y-1.5">
                            <textarea
                                ref={editRef}
                                value={editValue}
                                onChange={(e) => {
                                    setEditValue(e.target.value);
                                    e.target.style.height = "auto";
                                    e.target.style.height = e.target.scrollHeight + "px";
                                }}
                                onKeyDown={handleEditKeyDown}
                                className="w-full bg-[#1a1a20] border border-[#a7c8b3]/30 rounded-lg px-3 py-2 text-[13px] text-zinc-200 resize-none outline-none focus:border-[#a7c8b3]/60 leading-relaxed min-h-[36px] caret-[#a7c8b3]"
                                style={{ maxHeight: "200px" }}
                                rows={1}
                            />
                            <div className="flex items-center gap-1.5 text-[11px]">
                                <button
                                    onClick={submitEdit}
                                    disabled={saving}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#a7c8b3]/20 text-[#a7c8b3] hover:bg-[#a7c8b3]/30 transition-colors disabled:opacity-50 font-medium"
                                >
                                    <Check className="w-3 h-3" />
                                    {saving ? "Saving…" : "Save"}
                                </button>
                                <button
                                    onClick={cancelEdit}
                                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors font-medium"
                                >
                                    <X className="w-3 h-3" />
                                    Cancel
                                </button>
                                <span className="text-zinc-600">· Enter to save · Esc to cancel</span>
                            </div>
                        </div>
                    ) : (
                        <p className={cn(
                            "text-[14px] leading-relaxed break-words whitespace-pre-wrap",
                            message.deletedAt ? "text-zinc-600 italic" : "text-zinc-300"
                        )}>
                            {message.deletedAt ? "Message deleted" : renderBody(message.body)}
                        </p>
                    )}

                    {/* Reactions */}
                    {reactionEntries.length > 0 && !editing && (
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
                {!editing && (
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

                        {/* More (own messages and/or host actions) */}
                        {!isTemp && (isMe || onPin) && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <button className="p-1 rounded-md hover:bg-white/[0.03] text-zinc-500 hover:text-zinc-300 transition-all duration-150 hover:-translate-y-0.5 active:scale-95">
                                        <MoreHorizontal className="w-3.5 h-3.5" />
                                    </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                    align="end"
                                    className="bg-[#18181b] border border-white/5 text-xs min-w-[140px] rounded-[12px] p-1"
                                >
                                    {isMe && (
                                        <DropdownMenuItem
                                            onClick={startEdit}
                                            className="text-zinc-300 focus:text-zinc-100 focus:bg-white/[0.04] gap-2 cursor-pointer rounded-md"
                                        >
                                            <Pencil className="w-3.5 h-3.5" />
                                            Edit message
                                        </DropdownMenuItem>
                                    )}
                                    {onPin && (
                                        <DropdownMenuItem
                                            onClick={() => onPin(message.$id)}
                                            className="text-zinc-300 focus:text-zinc-100 focus:bg-white/[0.04] gap-2 cursor-pointer rounded-md"
                                        >
                                            {isPinned
                                                ? <><PinOff className="w-3.5 h-3.5" />Unpin message</>
                                                : <><Pin className="w-3.5 h-3.5" />Pin message</>
                                            }
                                        </DropdownMenuItem>
                                    )}
                                    {isMe && (
                                        <>
                                            <DropdownMenuSeparator className="bg-white/5 my-1" />
                                            <DropdownMenuItem
                                                onClick={handleDelete}
                                                className="text-rose-500 focus:text-rose-400 focus:bg-rose-500/10 gap-2 cursor-pointer rounded-md"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Delete message
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
