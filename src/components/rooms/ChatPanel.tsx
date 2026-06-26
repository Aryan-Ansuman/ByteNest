"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { useRoomStore } from "@/store/roomStore";
import { useHeartbeat } from "@/hooks/useHeartbeat";
import MessageBubble from "./MessageBubble";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";
import { toast } from "sonner";
import type { RoomMessage } from "@/types/rooms";
import { apiFetch } from "@/lib/api-fetch";
import { MessageSquare, ChevronDown, Loader2, ArrowDown } from "lucide-react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";

interface Props {
    roomId: string;
}

// ─── Date separator helpers ───────────────────────────────────────────────────

function formatDayLabel(date: Date): string {
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
}

function groupMessagesByDay(messages: RoomMessage[]): Array<{ label: string; messages: RoomMessage[] }> {
    const groups: Array<{ label: string; date: Date; messages: RoomMessage[] }> = [];
    for (const msg of messages) {
        const date = new Date(msg.$createdAt);
        const last = groups[groups.length - 1];
        if (last && isSameDay(last.date, date)) {
            last.messages.push(msg);
        } else {
            groups.push({ label: formatDayLabel(date), date, messages: [msg] });
        }
    }
    return groups;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatPanel({ roomId }: Props) {
    useHeartbeat(roomId);

    const messages        = useRoomStore((s) => s.messages);
    const hasMore         = useRoomStore((s) => s.hasMore);
    const isLoadingMore   = useRoomStore((s) => s.isLoadingMore);
    const oldestTs        = useRoomStore((s) => s.oldestTimestamp);
    const currentMember   = useRoomStore((s) => s.currentMember);
    const room            = useRoomStore((s) => s.room);
    const addMessage      = useRoomStore((s) => s.addMessage);
    const deleteMessage   = useRoomStore((s) => s.deleteMessage);
    const setLoadingMore  = useRoomStore((s) => s.setLoadingMore);
    const prependMessages = useRoomStore((s) => s.prependMessages);

    const [replyTo, setReplyTo]       = useState<RoomMessage | null>(null);
    const [parentMap, setParentMap]   = useState<Record<string, RoomMessage>>({});
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [newMsgCount, setNewMsgCount] = useState(0);

    const scrollRef  = useRef<HTMLDivElement>(null);
    const bottomRef  = useRef<HTMLDivElement>(null);
    const isAtBottom = useRef(true);
    const prevMsgLen = useRef(messages.length);

    // Auto-scroll only when near bottom
    useEffect(() => {
        if (isAtBottom.current) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
            setNewMsgCount(0);
        } else if (messages.length > prevMsgLen.current) {
            setNewMsgCount((c) => c + (messages.length - prevMsgLen.current));
        }
        prevMsgLen.current = messages.length;
    }, [messages.length]);

    // Prefetch parent messages for replies
    useEffect(() => {
        const replyIds = messages
            .filter((m) => m.replyToId && !parentMap[m.replyToId])
            .map((m) => m.replyToId!);
        const unique = Array.from(new Set(replyIds));
        if (unique.length === 0) return;
        unique.forEach(async (id) => {
            try {
                const res = await apiFetch<{ message: RoomMessage }>(
                    `/api/rooms/${roomId}/messages/${id}`
                );
                setParentMap((p) => ({ ...p, [id]: res.message }));
            } catch {}
        });
    }, [messages]);

    function handleScroll() {
        const el = scrollRef.current;
        if (!el) return;
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        isAtBottom.current = distFromBottom < 80;
        setShowScrollBtn(distFromBottom > 200);
        if (isAtBottom.current) setNewMsgCount(0);

        if (el.scrollTop < 120 && hasMore && !isLoadingMore) loadMore();
    }

    function scrollToBottom() {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        setNewMsgCount(0);
    }

    async function loadMore() {
        if (!oldestTs || isLoadingMore) return;
        setLoadingMore(true);
        const el = scrollRef.current;
        const prevHeight = el?.scrollHeight ?? 0;
        try {
            const res = await apiFetch<{ messages: RoomMessage[]; hasMore: boolean }>(
                `/api/rooms/${roomId}/messages?before=${encodeURIComponent(oldestTs)}`
            );
            prependMessages(res.messages, res.hasMore);
            requestAnimationFrame(() => {
                if (el) el.scrollTop = el.scrollHeight - prevHeight;
            });
        } catch {
            setLoadingMore(false);
        }
    }

    const handleSend = useCallback(
        async (body: string, replyToId?: string) => {
            if (!currentMember) return;

            const tempId = `temp-${Date.now()}`;
            const tempMsg: RoomMessage = {
                $id: tempId,
                $createdAt: new Date().toISOString(),
                roomId,
                authorId: currentMember.userId,
                authorName: currentMember.displayName,
                authorColor: currentMember.avatarColor,
                body,
                type: "text",
                replyToId: replyToId ?? undefined,
                reactions: "{}",
            };
            addMessage(tempMsg);

            try {
                await apiFetch(`/api/rooms/${roomId}/messages`, {
                    method: "POST",
                    body: JSON.stringify({ body, replyToId }),
                });
            } catch (err: any) {
                deleteMessage(tempId);
                toast.error(err?.message ?? "Failed to send message");
                if (err?.message === "Slow mode active" || err?.retryAfter) {
                    throw { retryAfter: err.retryAfter ?? 3 };
                }
            }
        },
        [roomId, currentMember]
    );

    async function handleReact(messageId: string, emoji: string) {
        try {
            await apiFetch(`/api/rooms/${roomId}/messages/${messageId}/react`, {
                method: "POST",
                body: JSON.stringify({ emoji }),
            });
        } catch {
            toast.error("Failed to react");
        }
    }

    const slowModeSeconds =
        room?.slowMode === "off" ? 0
        : room?.slowMode === "5s" ? 5
        : room?.slowMode === "30s" ? 30
        : room?.slowMode === "60s" ? 60
        : 0;

    const grouped = groupMessagesByDay(messages);

    return (
        <div className="flex flex-col h-full relative">
            {/* Load earlier */}
            {hasMore && (
                <div className="shrink-0 flex items-center justify-center py-2 border-b border-white/5 bg-panel">
                    <button
                        onClick={loadMore}
                        disabled={isLoadingMore}
                        className="flex items-center gap-1.5 text-[11px] font-medium text-tx-disabled hover:text-tx-secondary transition-colors disabled:opacity-40"
                    >
                        {isLoadingMore ? (
                            <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Loading earlier messages…
                            </>
                        ) : (
                            "↑ Load earlier"
                        )}
                    </button>
                </div>
            )}

            {/* Messages area wrapper */}
            <div className="flex-1 min-h-0 relative">
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="h-full overflow-y-auto absolute inset-0"
                    style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}
                >
                {messages.length === 0 && !isLoadingMore ? (
                    <EmptyState roomName={room?.name ?? "this room"} />
                ) : (
                    <div className="py-4">
                        {grouped.map((group) => (
                            <div key={group.label}>
                                {/* Date separator */}
                                <div className="flex items-center gap-3 px-4 py-2 sticky top-0 z-[1]">
                                    <div className="flex-1 h-px bg-white/[0.04]" />
                                    <span className="text-[12px] font-medium text-tx-muted bg-[#09090b] px-2.5 py-0.5 rounded-full border border-white/5">
                                        {group.label}
                                    </span>
                                    <div className="flex-1 h-px bg-white/[0.04]" />
                                </div>

                                <div className="space-y-0.5">
                                    {group.messages.map((msg, i) => {
                                        const prev = group.messages[i - 1];
                                        const isGrouped =
                                            prev &&
                                            prev.type !== "system" &&
                                            msg.type !== "system" &&
                                            prev.authorId === msg.authorId &&
                                            new Date(msg.$createdAt).getTime() -
                                            new Date(prev.$createdAt).getTime() < 5 * 60 * 1000 &&
                                            !msg.replyToId;

                                        return (
                                            <MessageBubble
                                                key={msg.$id}
                                                message={msg}
                                                currentUserId={currentMember?.userId ?? ""}
                                                onReact={handleReact}
                                                onReply={setReplyTo}
                                                parentMessage={
                                                    msg.replyToId
                                                        ? parentMap[msg.replyToId] ?? null
                                                        : null
                                                }
                                                compact={isGrouped}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {!messages.some(m => m.type !== "system") && messages.length > 0 && (
                            <div className="mt-8 mb-2 flex flex-col items-center select-none opacity-80">
                                <div className="w-full max-w-[200px] flex items-center justify-center mb-4">
                                    <div className="flex-1 h-px bg-white/[0.04]" />
                                </div>
                                <p className="text-[13px] font-[500] text-zinc-400">No messages yet.</p>
                                <p className="text-[13px] font-[500] text-zinc-500 mt-1">Say hello 👋</p>
                            </div>
                        )}

                        <div ref={bottomRef} className="h-4" />
                    </div>
                )}
                </div>

                {/* Scroll-to-bottom button */}
                {showScrollBtn && (
                    <button
                        onClick={scrollToBottom}
                        className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full bg-zinc-800/90 border border-white/5 text-tx-secondary hover:text-tx hover:bg-zinc-700 transition-all shadow-lg shadow-black/40 text-[11px] font-medium backdrop-blur-sm"
                    >
                        <ArrowDown className="w-3 h-3" />
                        {newMsgCount > 0 ? (
                            <span className="text-brand">{newMsgCount} new</span>
                        ) : (
                            "Jump to bottom"
                        )}
                    </button>
                )}
            </div>

            {/* Input area */}
            <div className="shrink-0 border-t border-white/5 bg-[#111113]">
                <div className="px-6 pt-4 -mb-1">
                    <TypingIndicator />
                </div>
                <MessageInput
                    roomId={roomId}
                    replyTo={replyTo}
                    onClearReply={() => setReplyTo(null)}
                    onSend={handleSend}
                    slowModeSeconds={slowModeSeconds}
                />
            </div>
        </div>
    );
}

function EmptyState({ roomName }: { roomName: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[300px] px-6 text-center">
            <div className="w-12 h-12 rounded-[14px] bg-[#a7c8b3]/10 border border-[#a7c8b3]/20 flex items-center justify-center mb-5">
                <MessageSquare className="w-5 h-5 text-[#a7c8b3]" />
            </div>
            <h3 className="text-[15px] font-[600] text-zinc-100 mb-2 tracking-tight">
                Welcome to {roomName}
            </h3>
            <p className="text-[13px] text-zinc-500 max-w-[240px] leading-relaxed">
                Messages are end-to-end encrypted and sync in real-time. Say hello!
            </p>
        </div>
    );
}
