"use client";

import { useState } from "react";
import { useRoomStore } from "@/store/roomStore";
import type { DiscussionRoom } from "@/types/rooms";
import {
    ArrowLeft, Users, Hash, Clock, Code, Globe, Lock,
    Copy, Check, ChevronDown, Info, X, Radio,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function RoomHeader({ room }: { room: DiscussionRoom }) {
    const members = useRoomStore((s) => s.members);
    const currentMember = useRoomStore((s) => s.currentMember);
    const codeSession = useRoomStore((s) => s.codeSession);

    const [showInfo, setShowInfo] = useState(false);
    const [copied, setCopied] = useState(false);

    const onlineCount = members.filter(
        (m) => m.status === "online" || m.status === "muted"
    ).length;
    const totalCount = members.length;
    const isHost = currentMember?.userId === room.hostId;

    async function copyInvite() {
        const link = room.inviteToken
            ? `${window.location.origin}/rooms/join/${room.inviteToken}`
            : window.location.href;
        await navigator.clipboard.writeText(link);
        setCopied(true);
        toast.success("Invite link copied");
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <>
            <header className="h-12 shrink-0 flex items-center justify-between px-3 border-b border-white/5 bg-[#080808] relative z-10">
                {/* Left */}
                <div className="flex items-center gap-2 min-w-0">
                    <Link
                        href="/rooms"
                        className="shrink-0 p-1.5 rounded-md hover:bg-surface-hover transition-colors text-tx-disabled hover:text-tx-secondary"
                        aria-label="Back to rooms"
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Link>

                    <div className="w-px h-4 bg-surface shrink-0" />

                    {/* Room icon */}
                    <div className="shrink-0 w-5 h-5 rounded flex items-center justify-center bg-brand/10">
                        <Hash className="w-3 h-3 text-brand" />
                    </div>

                    {/* Room name */}
                    <h1 className="text-sm font-semibold text-tx truncate max-w-[180px]">
                        {room.name}
                    </h1>

                    {/* Visibility badge */}
                    <div className={cn(
                        "hidden sm:flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border",
                        room.visibility === "private"
                            ? "bg-amber-500/8 border-amber-500/20 text-amber-500/70"
                            : "bg-zinc-800/60 border-b text-tx-disabled"
                    )}>
                        {room.visibility === "private"
                            ? <Lock className="w-2.5 h-2.5" />
                            : <Globe className="w-2.5 h-2.5" />
                        }
                        {room.visibility}
                    </div>

                    {/* Tags */}
                    <div className="hidden md:flex items-center gap-1 ml-1">
                        {room.tags.slice(0, 2).map((tag) => (
                            <span
                                key={tag}
                                className="text-[10px] bg-brand/8 text-brand/70 border border-[#a7c8b3]/15 rounded px-1.5 py-0.5 font-medium"
                            >
                                {tag}
                            </span>
                        ))}
                        {room.tags.length > 2 && (
                            <span className="text-[10px] text-tx-disabled">+{room.tags.length - 2}</span>
                        )}
                    </div>

                    {/* Slow mode badge */}
                    {room.slowMode !== "off" && (
                        <span className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-amber-500/8 text-amber-400/80 border border-amber-500/15 rounded px-1.5 py-0.5 font-medium">
                            <Clock className="w-2.5 h-2.5" />
                            {room.slowMode}
                        </span>
                    )}

                    {/* Code session live badge */}
                    {codeSession && (
                        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] bg-status-success/8 text-status-success border border-[#22c55e]/15 rounded px-1.5 py-0.5 font-semibold">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-60" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-status-success" />
                            </span>
                            Live code
                        </span>
                    )}
                </div>

                {/* Right */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* Member count */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-panel/60 border border-white/5">
                        <div className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-status-success opacity-40" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-status-success" />
                        </div>
                        <Users className="w-3 h-3 text-tx-muted" />
                        <span className="text-xs text-tx-secondary font-medium tabular-nums">
                            {onlineCount}
                        </span>
                        <span className="text-xs text-tx-disabled">/ {room.maxMembers}</span>
                    </div>

                    {/* Invite button (private rooms / host) */}
                    {(room.visibility === "private" || isHost) && (
                        <button
                            onClick={copyInvite}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border border-white/5 text-tx-secondary hover:text-tx hover:border-zinc-700 hover:bg-surface-hover transition-all"
                        >
                            {copied ? (
                                <Check className="w-3 h-3 text-brand" />
                            ) : (
                                <Copy className="w-3 h-3" />
                            )}
                            <span className="hidden sm:inline">{copied ? "Copied!" : "Invite"}</span>
                        </button>
                    )}

                    {/* Info toggle */}
                    <button
                        onClick={() => setShowInfo((v) => !v)}
                        className={cn(
                            "p-1.5 rounded-md transition-colors border",
                            showInfo
                                ? "bg-brand/10 border-[#a7c8b3]/20 text-brand"
                                : "border-transparent text-tx-disabled hover:text-tx-secondary hover:bg-surface-hover"
                        )}
                        aria-label="Room info"
                    >
                        <Info className="w-3.5 h-3.5" />
                    </button>
                </div>
            </header>

            {/* Info panel */}
            {showInfo && (
                <div className="shrink-0 border-b border-white/5 bg-[#0a0a0a] px-4 py-3 flex items-start gap-6">
                    <button
                        onClick={() => setShowInfo(false)}
                        className="absolute right-3 top-16 p-1 text-tx-disabled hover:text-tx-secondary transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>

                    {room.description && (
                        <div className="min-w-0">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-tx-disabled mb-1">About</p>
                            <p className="text-xs text-tx-secondary leading-relaxed max-w-xs">{room.description}</p>
                        </div>
                    )}

                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-tx-disabled mb-1">Tags</p>
                        <div className="flex flex-wrap gap-1">
                            {room.tags.length > 0 ? room.tags.map((t) => (
                                <span key={t} className="text-[10px] bg-brand/8 text-brand/70 border border-[#a7c8b3]/15 rounded px-1.5 py-0.5">#{t}</span>
                            )) : <span className="text-[10px] text-zinc-700">No tags</span>}
                        </div>
                    </div>

                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-tx-disabled mb-1">Capacity</p>
                        <div className="flex items-center gap-2">
                            <div className="h-1 w-24 rounded-full bg-surface overflow-hidden">
                                <div
                                    className="h-full rounded-full bg-brand/60 transition-all"
                                    style={{ width: `${Math.min((totalCount / room.maxMembers) * 100, 100)}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-tx-muted tabular-nums">{totalCount}/{room.maxMembers}</span>
                        </div>
                    </div>

                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-tx-disabled mb-1">Slow mode</p>
                        <span className="text-xs text-tx-secondary">{room.slowMode === "off" ? "Disabled" : room.slowMode}</span>
                    </div>
                </div>
            )}
        </>
    );
}
