"use client";

import { useRef, useState, useCallback, KeyboardEvent } from "react";
import type { RoomMessage } from "@/types/rooms";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { Send, X } from "lucide-react";

interface Props {
    roomId: string;
    replyTo: RoomMessage | null;
    onClearReply: () => void;
    onSend: (body: string, replyToId?: string) => Promise<void>;
    slowModeSeconds: number;
}

export default function MessageInput({
    roomId,
    replyTo,
    onClearReply,
    onSend,
    slowModeSeconds,
}: Props) {
    const [body, setBody] = useState("");
    const [sending, setSending] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const { startTyping, stopTyping } = useTypingIndicator(roomId);

    const startCooldown = useCallback((seconds: number) => {
        setCooldown(seconds);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setCooldown((v) => {
                if (v <= 1) {
                    clearInterval(cooldownRef.current!);
                    return 0;
                }
                return v - 1;
            });
        }, 1000);
    }, []);

    async function handleSend() {
        const trimmed = body.trim();
        if (!trimmed || sending || cooldown > 0) return;

        setSending(true);
        setBody("");
        stopTyping();

        try {
            await onSend(trimmed, replyTo?.$id);
            onClearReply();
        } catch (err: any) {
            setBody(trimmed); // restore body on error
            if (err?.retryAfter) startCooldown(err.retryAfter);
        } finally {
            setSending(false);
            textareaRef.current?.focus();
        }
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }

    function handleChange(v: string) {
        setBody(v);
        if (v.trim()) startTyping();
        else stopTyping();
    }

    const isDisabled = !body.trim() || sending || cooldown > 0;

    return (
        <div className="p-3 space-y-2">
            {/* Reply preview */}
            {replyTo && (
                <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2 text-xs border border-zinc-800">
                    <div className="flex-1 truncate text-zinc-400">
                        <span className="font-medium text-zinc-300">
                            Replying to {replyTo.authorName}:{" "}
                        </span>
                        {replyTo.body}
                    </div>
                    <button
                        onClick={onClearReply}
                        className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 rounded-md shrink-0 transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            )}

            {/* Input row */}
            <div className="flex items-end gap-2 bg-[#0a0a0a] rounded-xl border border-zinc-800 px-3 py-2 shadow-sm focus-within:border-zinc-700 focus-within:bg-zinc-900/20 transition-colors">
                <textarea
                    ref={textareaRef}
                    value={body}
                    onChange={(e) => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                        cooldown > 0
                            ? `Slow mode active — wait ${cooldown}s`
                            : "Message..."
                    }
                    disabled={cooldown > 0 || sending}
                    rows={1}
                    className={[
                        "flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600",
                        "resize-none outline-none leading-relaxed max-h-40 overflow-y-auto pt-1.5 pb-1",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                    ].join(" ")}
                    style={{ scrollbarWidth: "none" }}
                />

                <button
                    onClick={handleSend}
                    disabled={isDisabled}
                    className={[
                        "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 mb-0.5",
                        isDisabled
                            ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                            : "bg-indigo-500 text-white hover:bg-indigo-400 active:scale-95 shadow-sm shadow-indigo-500/20",
                    ].join(" ")}
                >
                    {sending ? (
                        <span className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : cooldown > 0 ? (
                        <span className="text-xs font-bold font-mono">{cooldown}</span>
                    ) : (
                        <Send className="w-3.5 h-3.5 -ml-0.5 mt-0.5" />
                    )}
                </button>
            </div>
        </div>
    );
}
