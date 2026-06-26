"use client";

import { useState } from "react";
import Link from "next/link";
import { useRoomStore } from "@/store/roomStore";
import type { DiscussionRoom } from "@/types/rooms";
import {
    Globe, Lock, UserPlus, Copy, Check, Command,
    MessageSquare, Code2, Users, Settings, Maximize2, Minimize2,
    MoreHorizontal, Hash, Timer, ChevronRight, ChevronLeft, Radio,
    XCircle, Zap, Hexagon,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const AVATAR_BG: Record<string, string> = {
    indigo:  "bg-indigo-500",
    violet:  "bg-violet-500",
    emerald: "bg-status-success",
    amber:   "bg-amber-500",
    rose:    "bg-status-danger",
    cyan:    "bg-cyan-500",
};

type PanelId = "chat" | "code" | "members" | "info";

interface Props {
    room: DiscussionRoom;
    roomId: string;
    hiddenPanels: Set<PanelId>;
    onTogglePanel: (id: PanelId) => void;
    onOpenCommand: () => void;
    onToggleInfo: () => void;
    focusMode: boolean;
    onToggleFocus: () => void;
}

export default function TopBar({
    room, roomId, hiddenPanels, onTogglePanel,
    onOpenCommand, onToggleInfo, focusMode, onToggleFocus,
}: Props) {
    const members       = useRoomStore((s) => s.members);
    const currentMember = useRoomStore((s) => s.currentMember);
    const codeSession   = useRoomStore((s) => s.codeSession);
    const messages      = useRoomStore((s) => s.messages);

    const [copied, setCopied] = useState(false);
    const [ending, setEnding] = useState(false);

    const isHost      = currentMember?.userId === room.hostId;
    const onlineCount = members.filter((m) => m.status === "online" || m.status === "muted").length;
    const onlineAvatars = members.filter((m) => m.status === "online").slice(0, 4);
    const overflow    = Math.max(0, onlineCount - onlineAvatars.length);

    const slowModeActive = room.slowMode !== "off";

    async function copyInvite() {
        const link = room.inviteToken
            ? `${window.location.origin}/rooms/join/${room.inviteToken}`
            : window.location.href;
        await navigator.clipboard.writeText(link);
        setCopied(true);
        toast.success("Invite link copied to clipboard");
        setTimeout(() => setCopied(false), 2500);
    }

    async function endSession() {
        if (!codeSession) return;
        setEnding(true);
        try {
            await apiFetch(`/api/rooms/${roomId}/session/${codeSession.$id}`, {
                method: "PATCH",
                body: JSON.stringify({ action: "end" }),
            });
            toast.success("Code session ended");
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to end session");
        } finally {
            setEnding(false);
        }
    }

    return (
        <header className="h-[44px] shrink-0 border-b border-white/5 bg-[#0a0a0a] bg-gradient-to-b from-white/[0.03] to-transparent flex items-center justify-between px-3 md:px-5 select-none relative z-10 shadow-sm">
            {/* Left — Brand / Logo */}
            <div className="flex items-center gap-3 w-1/3">
                <Link
                    href="/rooms"
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors -ml-1.5"
                    title="Back to Rooms"
                >
                    <ChevronLeft className="w-5 h-5" />
                </Link>
                <div className="flex items-center justify-center w-8 h-8 rounded-[12px] border border-white/10 bg-gradient-to-b from-[#1a1a1f] to-[#111113] shadow-sm">
                    <Hexagon className="w-4 h-4 text-[#a7c8b3]" />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[14px] font-[700] text-zinc-100 tracking-tight">{room.name}</span>
                </div>
            </div>

            {/* ── Center — panel toggle tabs ────────────────────────────── */}
            {!focusMode && (
                <div className="hidden md:flex items-center gap-6">
                    <PanelToggle
                        label="Chat"
                        active={!hiddenPanels.has("chat")}
                        onClick={() => onTogglePanel("chat")}
                    />
                    <PanelToggle
                        label="Code"
                        active={!hiddenPanels.has("code")}
                        onClick={() => onTogglePanel("code")}
                    />
                    <PanelToggle
                        label="Members"
                        active={!hiddenPanels.has("members")}
                        onClick={() => onTogglePanel("members")}
                    />
                </div>
            )}

            {/* ── Right — avatars, stats, actions ──────────────────────── */}
            <div className="flex items-center justify-end gap-2 shrink-0 w-1/3">

                {/* Command palette trigger */}
                <button
                    onClick={onOpenCommand}
                    className="hidden sm:flex items-center justify-center px-2.5 py-1.5 text-[11px] font-semibold font-mono text-tx-muted border border-white/5 rounded-lg hover:bg-zinc-800/40 hover:text-tx-secondary transition-all"
                    title="Command palette (⌘K)"
                >
                    ⌘K
                </button>

                {/* Room settings */}
                <button
                    onClick={onToggleInfo}
                    className="p-1.5 text-tx-muted hover:text-tx-secondary hover:bg-zinc-800/40 rounded-lg transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                    title="Room info & settings"
                >
                    <Settings className="w-4 h-4" />
                </button>

                {/* Focus mode */}
                <button
                    onClick={onToggleFocus}
                    className={cn(
                        "p-1.5 rounded-lg transition-colors",
                        focusMode
                            ? "text-brand bg-brand/10 hover:bg-brand/15"
                            : "text-tx-muted hover:text-tx-secondary hover:bg-zinc-800/40"
                    )}
                    title={focusMode ? "Exit focus mode (⌘\\)" : "Focus mode (⌘\\)"}
                >
                    {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>

                {/* Separator */}
                <div className="h-5 w-px bg-zinc-800/60" />

                {/* Invite */}
                <button
                    onClick={copyInvite}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-tx-secondary bg-surface-hover hover:bg-surface border border-white/5 rounded-lg transition-all duration-150 hover:-translate-y-0.5 active:scale-95"
                >
                    {copied ? <Check className="w-3.5 h-3.5 text-brand" /> : <UserPlus className="w-3.5 h-3.5" />}
                    <span className="hidden sm:block">{copied ? "Copied!" : "Invite"}</span>
                </button>
            </div>
        </header>
    );
}

function PanelToggle({
    label, active, onClick
}: {
    label: string;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            title={`Toggle ${label}`}
            className={cn(
                "relative py-1 text-[13px] font-[500] transition-colors duration-150",
                active
                    ? "text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
            )}
        >
            {label}
            {active && (
                <motion.div
                    initial={{ opacity: 0, scaleX: 0.5 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute -bottom-[5px] -left-1.5 -right-1.5 h-[2px] bg-[#a7c8b3] rounded-full shadow-[0_0_10px_rgba(167,200,179,0.5)]"
                />
            )}
        </button>
    );
}
