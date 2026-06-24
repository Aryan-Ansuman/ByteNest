"use client";

import { useRoomStore } from "@/store/roomStore";
import type { DiscussionRoom } from "@/types/rooms";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function RoomHeader({ room }: { room: DiscussionRoom }) {
    const members = useRoomStore((s) => s.members);
    const onlineCount = members.filter((m) => m.status === "online" || m.status === "muted").length;

    return (
        <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-zinc-800 bg-[#0a0a0a]">
            <div className="flex items-center gap-3">
                <Link
                    href="/rooms"
                    className="p-1.5 rounded-md hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-200"
                >
                    <ArrowLeft className="w-4 h-4" />
                </Link>

                <div className="h-5 w-px bg-zinc-800" />

                <h1 className="font-semibold text-sm truncate max-w-xs">{room.name}</h1>

                {room.tags.map((tag) => (
                    <span
                        key={tag}
                        className="text-[11px] bg-indigo-500/15 text-indigo-300 rounded px-2 py-0.5 font-medium"
                    >
                        {tag}
                    </span>
                ))}

                {room.slowMode !== "off" && (
                    <span className="text-[11px] bg-amber-500/15 text-amber-300 rounded px-2 py-0.5 font-medium">
                        🐢 {room.slowMode}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
                {onlineCount} online
            </div>
        </header>
    );
}
