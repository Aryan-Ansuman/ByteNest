"use client";

import { useRoomStore } from "@/store/roomStore";

export default function TypingIndicator() {
    const names = useRoomStore((s) => s.typingUserNames);

    if (names.length === 0) return <div className="h-5" />;

    let text = "";
    if (names.length === 1) {
        text = `${names[0]} is typing…`;
    } else if (names.length === 2) {
        text = `${names[0]} and ${names[1]} are typing…`;
    } else {
        text = `${names[0]} and ${names.length - 1} others are typing…`;
    }

    return (
        <div className="flex items-center gap-2 text-xs text-zinc-500 h-5 px-1">
            <TypingDots />
            <span>{text}</span>
        </div>
    );
}

function TypingDots() {
    return (
        <div className="flex items-center gap-0.5">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="w-1 h-1 rounded-full bg-zinc-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                />
            ))}
        </div>
    );
}
