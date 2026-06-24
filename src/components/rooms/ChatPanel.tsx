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

interface Props {
    roomId: string;
}

export default function ChatPanel({ roomId }: Props) {
    useHeartbeat(roomId);

    const messages = useRoomStore((s) => s.messages);
    const hasMore = useRoomStore((s) => s.hasMore);
    const isLoadingMore = useRoomStore((s) => s.isLoadingMore);
    const oldestTs = useRoomStore((s) => s.oldestTimestamp);
    const currentMember = useRoomStore((s) => s.currentMember);
    const room = useRoomStore((s) => s.room);
    const addMessage = useRoomStore((s) => s.addMessage);
    const deleteMessage = useRoomStore((s) => s.deleteMessage);
    const setLoadingMore = useRoomStore((s) => s.setLoadingMore);
    const prependMessages = useRoomStore((s) => s.prependMessages);

    const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
    const [parentMap, setParentMap] = useState<Record<string, RoomMessage>>({});

    const scrollRef = useRef<HTMLDivElement>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const isAtBottom = useRef(true);

    // Auto-scroll only when near bottom
    useEffect(() => {
        if (isAtBottom.current) {
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
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

    // Scroll-to-top loads more messages
    function handleScroll() {
        const el = scrollRef.current;
        if (!el) return;

        isAtBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 80;

        if (el.scrollTop < 100 && hasMore && !isLoadingMore) {
            loadMore();
        }
    }

    async function loadMore() {
        if (!oldestTs || isLoadingMore) return;
        setLoadingMore(true);

        const el = scrollRef.current;
        const prevHeight = el?.scrollHeight ?? 0;

        try {
            const res = await apiFetch<{
                messages: RoomMessage[];
                hasMore: boolean;
            }>(
                `/api/rooms/${roomId}/messages?before=${encodeURIComponent(
                    oldestTs
                )}`
            );
            prependMessages(res.messages, res.hasMore);

            // Restore scroll position
            requestAnimationFrame(() => {
                if (el) el.scrollTop = el.scrollHeight - prevHeight;
            });
        } catch {
            setLoadingMore(false);
        }
    }

    // Optimistic send
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
                // Realtime will deliver the real message and replaceTempMessage
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

    // React to message
    async function handleReact(messageId: string, emoji: string) {
        try {
            await apiFetch(
                `/api/rooms/${roomId}/messages/${messageId}/react`,
                {
                    method: "POST",
                    body: JSON.stringify({ emoji }),
                }
            );
        } catch {
            toast.error("Failed to react");
        }
    }

    const slowModeSeconds =
        room?.slowMode === "off"
            ? 0
            : room?.slowMode === "5s"
            ? 5
            : room?.slowMode === "30s"
            ? 30
            : room?.slowMode === "60s"
            ? 60
            : 0;

    return (
        <div className="flex flex-col h-full">
            {/* Load more banner */}
            {hasMore && (
                <div className="text-center py-3 border-b border-zinc-800 bg-[#0a0a0a]/50">
                    <button
                        onClick={loadMore}
                        disabled={isLoadingMore}
                        className="text-[11px] font-medium tracking-wide uppercase text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                    >
                        {isLoadingMore ? "Loading..." : "Load earlier messages"}
                    </button>
                </div>
            )}

            {/* Messages scroll area */}
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto py-4 space-y-1 scroll-smooth"
                style={{
                    scrollbarWidth: "thin",
                    scrollbarColor: "rgba(255,255,255,0.1) transparent",
                }}
            >
                {messages.length === 0 && !isLoadingMore && (
                    <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-2">
                        <p className="text-sm">No messages yet</p>
                        <p className="text-xs">Be the first to say hello!</p>
                    </div>
                )}
                
                {messages.map((msg) => (
                    <MessageBubble
                        key={msg.$id}
                        message={msg}
                        currentUserId={currentMember?.userId ?? ""}
                        onReact={handleReact}
                        onReply={setReplyTo}
                        parentMessage={
                            msg.replyToId ? parentMap[msg.replyToId] ?? null : null
                        }
                    />
                ))}
                <div ref={bottomRef} className="h-2" />
            </div>

            {/* Typing + input */}
            <div className="shrink-0 border-t border-zinc-800 bg-[#0a0a0a]">
                <div className="px-4 pt-2">
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
