"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { RoomMessage } from "@/types/rooms";
import { X, Clock, AtSign, Hash, Smile, ArrowUp } from "lucide-react";
import { useRoomStore } from "@/store/roomStore";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { cn } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

interface Props {
    roomId: string;
    replyTo: RoomMessage | null;
    onClearReply: () => void;
    onSend: (body: string, replyToId?: string) => Promise<void>;
    slowModeSeconds: number;
}

const MAX_CHARS = 2000;

const QUICK_EMOJI = [
    "👍", "❤️", "😂", "🔥", "✅", "👀", "🎉", "💯",
    "🤔", "😍", "🚀", "👏", "😅", "🙏", "💪", "⚡",
];

export default function MessageInput({
    roomId,
    replyTo,
    onClearReply,
    onSend,
    slowModeSeconds,
}: Props) {
    const [value, setValue]       = useState("");
    const [sending, setSending]   = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [focused, setFocused]   = useState(false);

    const textareaRef  = useRef<HTMLTextAreaElement>(null);
    const cooldownRef  = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Real typing indicator (Appwrite-backed) ────────────────────────────
    const { startTyping, stopTyping } = useTypingIndicator(roomId);

    const members = useRoomStore((s) => s.members);

    // Auto-focus on reply
    useEffect(() => {
        if (replyTo) textareaRef.current?.focus();
    }, [replyTo]);

    // Auto-resize textarea
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 140) + "px";
    }, [value]);

    // ── Helpers: insert text at cursor position ────────────────────────────
    function insertAtCursor(text: string) {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? value.length;
        const end   = el.selectionEnd   ?? value.length;
        const next  = value.slice(0, start) + text + value.slice(end);
        if (next.length > MAX_CHARS) return;
        setValue(next);
        // Restore cursor after the inserted text
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = start + text.length;
            el.selectionEnd   = start + text.length;
        });
    }

    function handleTyping(val: string) {
        if (val.length > MAX_CHARS) return;
        setValue(val);
        if (val.trim()) {
            startTyping();
        } else {
            stopTyping();
        }
    }

    function startCooldown(seconds: number) {
        setCooldown(seconds);
        if (cooldownRef.current) clearInterval(cooldownRef.current);
        cooldownRef.current = setInterval(() => {
            setCooldown((c) => {
                if (c <= 1) { clearInterval(cooldownRef.current!); return 0; }
                return c - 1;
            });
        }, 1000);
    }

    async function submit() {
        const body = value.trim();
        if (!body || sending || cooldown > 0) return;

        setSending(true);
        stopTyping();
        try {
            await onSend(body, replyTo?.$id);
            setValue("");
            onClearReply();
            if (slowModeSeconds > 0) startCooldown(slowModeSeconds);
        } catch (err: any) {
            if (err?.retryAfter) startCooldown(err.retryAfter);
        } finally {
            setSending(false);
            textareaRef.current?.focus();
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    }

    // ── Mention: insert @name of first matching online member ──────────────
    function handleMention() {
        insertAtCursor("@");
        textareaRef.current?.focus();
    }

    // ── Tag: insert # ──────────────────────────────────────────────────────
    function handleHashTag() {
        insertAtCursor("#");
        textareaRef.current?.focus();
    }

    return (
        <div className="px-6 pb-6 pt-2 transition-all">
            {/* Reply Context */}
            {replyTo && (
                <div className="flex items-start justify-between gap-4 px-3 py-2 mb-2 rounded-xl bg-brand/10 border border-[#a7c8b3]/20">
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold text-brand mb-0.5">
                            Replying to {replyTo.authorName}
                        </p>
                        <p className="text-xs text-tx-secondary truncate">{replyTo.body}</p>
                    </div>
                    <button
                        onClick={onClearReply}
                        className="shrink-0 p-1 rounded-md hover:bg-surface-hover text-tx-muted hover:text-tx-secondary transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            <div className={cn(
                "relative flex flex-col bg-[#18181b] border border-white/5 rounded-[14px] transition-all overflow-hidden shadow-sm",
                focused ? "border-[#a7c8b3] shadow-[0_0_0_1px_#a7c8b3]" : "",
                cooldown > 0 ? "opacity-70 grayscale pointer-events-none" : ""
            )}>
                {/* Textarea */}
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(e) => handleTyping(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setFocused(true)}
                    onBlur={() => {
                        setFocused(false);
                        stopTyping();
                    }}
                    placeholder={cooldown > 0 ? `Slow mode: wait ${cooldown}s…` : "Type a message..."}
                    className="flex-1 max-h-[140px] bg-transparent text-sm text-tx placeholder-[#7A7A82] resize-none outline-none px-4 pt-3 pb-2 leading-relaxed caret-[#a7c8b3]"
                    rows={1}
                />

                {/* Bottom Tools & Send */}
                <div className="flex items-center justify-between px-2 pb-2">
                    {/* Formatting tools */}
                    <div className="flex items-center gap-1 text-tx-muted">
                        {/* Emoji Picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    type="button"
                                    className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-tx-secondary transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                                    title="Emoji"
                                >
                                    <Smile className="w-4 h-4" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent
                                side="top"
                                align="start"
                                className="w-auto p-2 bg-[#18181b] border-white/5 shadow-xl rounded-xl"
                            >
                                <div className="grid grid-cols-8 gap-1">
                                    {QUICK_EMOJI.map((e) => (
                                        <button
                                            key={e}
                                            type="button"
                                            onClick={() => insertAtCursor(e)}
                                            className="text-base hover:scale-125 transition-transform px-1 py-0.5 rounded-md hover:bg-white/[0.04]"
                                        >
                                            {e}
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Mention */}
                        <button
                            type="button"
                            onClick={handleMention}
                            className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-tx-secondary transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                            title="Mention someone"
                        >
                            <AtSign className="w-4 h-4" />
                        </button>

                        {/* Tag */}
                        <button
                            type="button"
                            onClick={handleHashTag}
                            className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-tx-secondary transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                            title="Tag"
                        >
                            <Hash className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <span className={cn(
                            "text-[12px] tabular-nums font-medium",
                            value.length > MAX_CHARS * 0.9 ? "text-amber-500" : "text-zinc-600"
                        )}>
                            {value.length}/{MAX_CHARS}
                        </span>

                        {/* Send Button */}
                        <button
                            type="button"
                            onClick={submit}
                            disabled={!value.trim() || sending || cooldown > 0}
                            className={cn(
                                "shrink-0 p-1.5 rounded-full flex items-center justify-center transition-all duration-150 hover:-translate-y-0.5",
                                value.trim() && !sending && cooldown === 0
                                    ? "bg-[#a7c8b3] text-[#08100b] hover:bg-white active:scale-95 shadow-[0_0_10px_rgba(167,200,179,0.3)]"
                                    : "bg-white/[0.06] text-tx-disabled cursor-not-allowed"
                            )}
                        >
                            <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {/* Slow mode indicator overlay */}
                {cooldown > 0 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#17171c]/80 backdrop-blur-sm">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-500 tabular-nums">
                            {cooldown}s cooldown
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
