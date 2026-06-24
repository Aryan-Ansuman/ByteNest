"use client";

import { useState } from "react";
import type { RoomMessage, ParsedReactions } from "@/types/rooms";

const COLOR_MAP: Record<string, string> = {
    indigo: "bg-indigo-500",
    violet: "bg-violet-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    cyan: "bg-cyan-500",
};

const EMOJI_OPTIONS = ["👍", "❤️", "🔥", "😂", "😮", "👏"];

interface Props {
    message: RoomMessage;
    currentUserId: string;
    onReact: (messageId: string, emoji: string) => void;
    onReply: (message: RoomMessage) => void;
    parentMessage?: RoomMessage | null;
}

export default function MessageBubble({
    message,
    currentUserId,
    onReact,
    onReply,
    parentMessage,
}: Props) {
    const [showReactions, setShowReactions] = useState(false);
    const isTemp = message.$id.startsWith("temp-");
    const isSystem = message.type === "system";

    const reactions: ParsedReactions = (() => {
        try {
            return JSON.parse(message.reactions ?? "{}");
        } catch {
            return {};
        }
    })();

    if (isSystem) {
        return (
            <div className="flex justify-center py-2">
                <span className="text-[11px] font-medium tracking-wide uppercase text-zinc-500 bg-zinc-800/30 rounded-full px-3 py-1">
                    {message.body}
                </span>
            </div>
        );
    }

    return (
        <div
            className={[
                "group flex gap-3 px-4 py-1.5 hover:bg-zinc-800/30 transition-colors",
                isTemp ? "opacity-60" : "",
            ].join(" ")}
            onMouseLeave={() => setShowReactions(false)}
        >
            {/* Avatar */}
            <div className="shrink-0 mt-0.5">
                <div
                    className={[
                        "w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white",
                        COLOR_MAP[message.authorColor] ?? "bg-indigo-500",
                    ].join(" ")}
                >
                    {message.authorName[0]?.toUpperCase() ?? "?"}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                {/* Author + timestamp */}
                <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-sm font-medium text-zinc-200">
                        {message.authorName}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-medium">
                        {formatTime(message.$createdAt)}
                    </span>
                    {message.editedAt && (
                        <span className="text-[10px] text-zinc-600 font-medium">
                            (edited)
                        </span>
                    )}
                </div>

                {/* Reply preview */}
                {parentMessage && (
                    <div className="border-l-2 border-zinc-700 pl-2 mb-1.5 mt-1 text-xs text-zinc-400 truncate max-w-sm rounded-r-sm bg-zinc-800/20 py-1 pr-2">
                        <span className="font-medium text-zinc-300">
                            {parentMessage.authorName}:{" "}
                        </span>
                        {parentMessage.body}
                    </div>
                )}

                {/* Body */}
                {message.type === "code" ? (
                    <pre className="text-xs bg-[#0a0a0a] border border-zinc-800 rounded-md p-3 overflow-x-auto text-emerald-300 font-mono mt-1">
                        <code>{message.body}</code>
                    </pre>
                ) : (
                    <div
                        className="text-sm text-zinc-300 leading-relaxed break-words prose prose-invert prose-p:my-0 prose-pre:my-1 prose-pre:bg-[#0a0a0a] prose-pre:border prose-pre:border-zinc-800 prose-code:text-emerald-300"
                        dangerouslySetInnerHTML={{ __html: message.body }}
                    />
                )}

                {/* Reactions */}
                {Object.keys(reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(reactions).map(([emoji, uids]) => {
                            if (!uids || uids.length === 0) return null;
                            const hasReacted = uids.includes(currentUserId);
                            return (
                                <button
                                    key={emoji}
                                    onClick={() => onReact(message.$id, emoji)}
                                    className={[
                                        "flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 border transition-all duration-200",
                                        hasReacted
                                            ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                                            : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200",
                                    ].join(" ")}
                                >
                                    <span>{emoji}</span>
                                    <span className="font-medium text-[10px]">{uids.length}</span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Action bar (hover) */}
            <div
                className={[
                    "shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                    isTemp ? "pointer-events-none" : "",
                ].join(" ")}
            >
                <div className="relative">
                    <button
                        onClick={() => setShowReactions((v) => !v)}
                        className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                        title="React"
                    >
                        😊
                    </button>
                    {showReactions && (
                        <div className="absolute right-0 bottom-full mb-1 flex gap-1 bg-[#0a0a0a] border border-zinc-800 rounded-lg p-1 shadow-xl z-10 animate-in zoom-in-95 duration-100">
                            {EMOJI_OPTIONS.map((e) => (
                                <button
                                    key={e}
                                    onClick={() => {
                                        onReact(message.$id, e);
                                        setShowReactions(false);
                                    }}
                                    className="text-base hover:scale-125 transition-transform p-1"
                                >
                                    {e}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    onClick={() => onReply(message)}
                    className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 text-xs font-medium transition-colors"
                    title="Reply"
                >
                    Reply
                </button>
            </div>
        </div>
    );
}

function formatTime(iso: string) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}
