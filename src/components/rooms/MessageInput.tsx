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
    disabled?: boolean;
}

const MAX_CHARS = 2000;

const QUICK_EMOJI = [
    "👍", "❤️", "😂", "🔥", "✅", "👀", "🎉", "💯",
    "🤔", "😍", "🚀", "👏", "😅", "🙏", "💪", "⚡",
];

// Extract the @mention prefix the user is currently typing
function getMentionQuery(value: string, cursor: number): string | null {
    const before = value.slice(0, cursor);
    const match  = before.match(/@([\w\d_-]*)$/);
    return match ? match[1] : null;
}

export default function MessageInput({
    roomId,
    replyTo,
    onClearReply,
    onSend,
    slowModeSeconds,
    disabled = false,
}: Props) {
    const [value, setValue]       = useState("");
    const [sending, setSending]   = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [focused, setFocused]   = useState(false);

    // Mention autocomplete
    const [mentionQuery, setMentionQuery]   = useState<string | null>(null);
    const [mentionIdx, setMentionIdx]       = useState(0);
    const [mentionAnchorPos, setMentionAnchorPos] = useState<{ top: number; left: number } | null>(null);

    const textareaRef  = useRef<HTMLTextAreaElement>(null);
    const cooldownRef  = useRef<ReturnType<typeof setInterval> | null>(null);

    const { startTyping, stopTyping } = useTypingIndicator(roomId);
    const members = useRoomStore((s) => s.members);
    const currentMember = useRoomStore((s) => s.currentMember);

    // Filter mention candidates — online members except self
    const mentionCandidates = mentionQuery !== null
        ? members.filter(
            (m) =>
                m.userId !== currentMember?.userId &&
                m.status !== "offline" &&
                m.displayName.toLowerCase().startsWith(mentionQuery.toLowerCase())
        ).slice(0, 5)
        : [];

    const showMentionPopup = mentionQuery !== null && mentionCandidates.length > 0;

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

    function insertAtCursor(text: string) {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? value.length;
        const end   = el.selectionEnd   ?? value.length;
        const next  = value.slice(0, start) + text + value.slice(end);
        if (next.length > MAX_CHARS) return;
        setValue(next);
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = start + text.length;
            el.selectionEnd   = start + text.length;
        });
    }

    function handleTyping(val: string) {
        if (val.length > MAX_CHARS) return;
        setValue(val);
        if (val.trim()) startTyping(); else stopTyping();

        // Detect mention
        const cursor = textareaRef.current?.selectionStart ?? val.length;
        const q = getMentionQuery(val, cursor);
        setMentionQuery(q);
        setMentionIdx(0);
    }

    function completeMention(displayName: string) {
        const el = textareaRef.current;
        if (!el) return;
        const cursor = el.selectionStart ?? value.length;
        const before = value.slice(0, cursor);
        const after  = value.slice(cursor);
        // Replace @<partial> with @<full name> + trailing space
        const replaced = before.replace(/@([\w\d_-]*)$/, `@${displayName} `);
        const next = replaced + after;
        if (next.length > MAX_CHARS) return;
        setValue(next);
        setMentionQuery(null);
        requestAnimationFrame(() => {
            el.focus();
            el.selectionStart = replaced.length;
            el.selectionEnd   = replaced.length;
        });
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
        if (disabled) return;
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
        // Navigate mention popup
        if (showMentionPopup) {
            if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx((i) => (i + 1) % mentionCandidates.length); return; }
            if (e.key === "ArrowUp")   { e.preventDefault(); setMentionIdx((i) => (i - 1 + mentionCandidates.length) % mentionCandidates.length); return; }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                completeMention(mentionCandidates[mentionIdx]?.displayName ?? "");
                return;
            }
            if (e.key === "Escape") { setMentionQuery(null); return; }
        }

        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    }

    function handleMentionButton() {
        insertAtCursor("@");
        // Trigger mention detection manually
        const el = textareaRef.current;
        if (el) {
            const next = el.value;
            const cursor = el.selectionStart ?? next.length;
            setMentionQuery(getMentionQuery(next + "@", cursor + 1) ?? "");
        }
        textareaRef.current?.focus();
    }

    return (
        <div className="px-6 pb-6 pt-2 transition-all relative">
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

            {/* Mention autocomplete popup */}
            {showMentionPopup && (
                <div className="absolute bottom-[calc(100%-1.5rem)] left-6 z-50 mb-2 bg-[#18181b] border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[200px]">
                    <div className="px-3 py-1.5 border-b border-white/5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Mention</span>
                    </div>
                    {mentionCandidates.map((m, i) => (
                        <button
                            key={m.$id}
                            onMouseDown={(e) => { e.preventDefault(); completeMention(m.displayName); }}
                            className={cn(
                                "w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                                i === mentionIdx ? "bg-[#a7c8b3]/10 text-[#a7c8b3]" : "text-zinc-300 hover:bg-white/[0.04]"
                            )}
                        >
                            <div className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                                {m.displayName[0]?.toUpperCase()}
                            </div>
                            <span className="text-[13px] font-medium">{m.displayName}</span>
                            <span className={cn(
                                "ml-auto text-[10px] font-medium",
                                m.status === "online" ? "text-[#a7c8b3]" : "text-amber-400"
                            )}>
                                {m.status}
                            </span>
                        </button>
                    ))}
                    <div className="px-3 py-1 bg-[#111113] border-t border-white/5">
                        <span className="text-[10px] text-zinc-600">↑↓ navigate · Enter to select · Esc to dismiss</span>
                    </div>
                </div>
            )}

            <div className={cn(
                "relative flex flex-col bg-[#18181b] border border-white/5 rounded-[14px] transition-all overflow-hidden shadow-sm",
                focused ? "border-[#a7c8b3] shadow-[0_0_0_1px_#a7c8b3]" : "",
                (cooldown > 0 || disabled) ? "opacity-70 grayscale pointer-events-none" : ""
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
                        // Delay hide to allow mention click to register
                        setTimeout(() => setMentionQuery(null), 150);
                    }}
                    disabled={disabled}
                    placeholder={disabled ? "You're muted in this room" : cooldown > 0 ? `Slow mode: wait ${cooldown}s…` : "Type a message…"}
                    className="flex-1 max-h-[140px] bg-transparent text-sm text-tx placeholder-[#7A7A82] resize-none outline-none px-4 pt-3 pb-2 leading-relaxed caret-[#a7c8b3]"
                    rows={1}
                />

                {/* Bottom Tools & Send */}
                <div className="flex items-center justify-between px-2 pb-2">
                    <div className="flex items-center gap-1 text-tx-muted">
                        {/* Emoji Picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <button type="button" className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-tx-secondary transition-all duration-150 hover:-translate-y-0.5 active:scale-95" title="Emoji">
                                    <Smile className="w-4 h-4" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" align="start" className="w-auto p-2 bg-[#18181b] border-white/5 shadow-xl rounded-xl">
                                <div className="grid grid-cols-8 gap-1">
                                    {QUICK_EMOJI.map((e) => (
                                        <button key={e} type="button" onClick={() => insertAtCursor(e)} className="text-base hover:scale-125 transition-transform px-1 py-0.5 rounded-md hover:bg-white/[0.04]">
                                            {e}
                                        </button>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>

                        {/* Mention */}
                        <button
                            type="button"
                            onClick={handleMentionButton}
                            className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-tx-secondary transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                            title="Mention someone (@)"
                        >
                            <AtSign className="w-4 h-4" />
                        </button>

                        {/* Tag */}
                        <button
                            type="button"
                            onClick={() => { insertAtCursor("#"); textareaRef.current?.focus(); }}
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

                        <button
                            type="button"
                            onClick={submit}
                            disabled={!value.trim() || sending || cooldown > 0 || disabled}
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

                {/* Slow mode overlay */}
                {cooldown > 0 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-[#17171c]/80 backdrop-blur-sm">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-500 tabular-nums">{cooldown}s cooldown</span>
                    </div>
                )}
            </div>
        </div>
    );
}
