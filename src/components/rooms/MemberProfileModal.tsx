"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Crown, Clock, MessageSquare, Calendar, Wifi, WifiOff, VolumeX, Moon } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { RoomMember } from "@/types/rooms";
import { useRoomStore } from "@/store/roomStore";
import { cn } from "@/lib/utils";

const AVATAR_BG: Record<string, string> = {
    indigo:  "bg-indigo-500",
    violet:  "bg-violet-500",
    emerald: "bg-emerald-500",
    amber:   "bg-amber-500",
    rose:    "bg-rose-500",
    cyan:    "bg-cyan-500",
};

const AVATAR_GLOW: Record<string, string> = {
    indigo:  "shadow-[0_0_24px_rgba(99,102,241,0.35)]",
    violet:  "shadow-[0_0_24px_rgba(139,92,246,0.35)]",
    emerald: "shadow-[0_0_24px_rgba(16,185,129,0.35)]",
    amber:   "shadow-[0_0_24px_rgba(245,158,11,0.35)]",
    rose:    "shadow-[0_0_24px_rgba(244,63,94,0.35)]",
    cyan:    "shadow-[0_0_24px_rgba(6,182,212,0.35)]",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType; dot: string }> = {
    online:  { label: "Online",  color: "text-[#a7c8b3]", icon: Wifi,     dot: "bg-[#a7c8b3] shadow-[0_0_8px_rgba(167,200,179,0.5)]" },
    away:    { label: "Away",    color: "text-amber-400",  icon: Moon,     dot: "bg-amber-400" },
    offline: { label: "Offline", color: "text-zinc-500",   icon: WifiOff,  dot: "bg-zinc-600" },
    muted:   { label: "Muted",   color: "text-rose-400",   icon: VolumeX,  dot: "bg-rose-400" },
};

interface Props {
    member: RoomMember;
    onClose: () => void;
}

export function MemberProfileModal({ member, onClose }: Props) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const room       = useRoomStore((s) => s.room);
    const messages   = useRoomStore((s) => s.messages);

    // Count this member's non-system messages in the loaded history
    const messageCount = messages.filter(
        (m) => m.authorId === member.userId && m.type !== "system" && !m.deletedAt
    ).length;

    const isHost      = member.userId === room?.hostId;
    const status      = STATUS_CONFIG[member.status] ?? STATUS_CONFIG.offline;
    const StatusIcon  = status.icon;

    const initials = member.displayName
        .split(" ")
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("");

    // Close on Escape
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return createPortal(
        <AnimatePresence>
            <motion.div
                ref={overlayRef}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
            >
                {/* Backdrop */}
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                {/* Card */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 8 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="relative w-full max-w-[340px] rounded-2xl border border-white/[0.07] bg-[#0e0e10] shadow-2xl shadow-black/60 overflow-hidden"
                >
                    {/* ── Banner gradient ── */}
                    <div
                        className={cn(
                            "h-[72px] w-full opacity-20",
                            AVATAR_BG[member.avatarColor] ?? "bg-zinc-700"
                        )}
                        style={{
                            background: `radial-gradient(ellipse at 50% 150%, var(--tw-gradient-stops))`,
                        }}
                    />

                    {/* ── Close button ── */}
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors z-10"
                        aria-label="Close profile"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>

                    {/* ── Avatar (overlaps banner) ── */}
                    <div className="px-5 pb-5">
                        <div className="flex items-end gap-4 -mt-9 mb-4">
                            <div
                                className={cn(
                                    "w-[68px] h-[68px] rounded-2xl flex items-center justify-center text-[22px] font-bold text-white border-4 border-[#0e0e10] shrink-0",
                                    AVATAR_BG[member.avatarColor] ?? "bg-zinc-700",
                                    AVATAR_GLOW[member.avatarColor] ?? ""
                                )}
                            >
                                {initials || "?"}
                            </div>

                            {/* Host badge next to avatar */}
                            {isHost && (
                                <div className="mb-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25">
                                    <Crown className="w-3 h-3 text-amber-400" />
                                    <span className="text-[11px] font-semibold text-amber-400">Host</span>
                                </div>
                            )}

                            {member.isAI && (
                                <div className="mb-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25">
                                    <span className="text-[11px] font-semibold text-indigo-400">AI</span>
                                </div>
                            )}
                        </div>

                        {/* ── Name & status ── */}
                        <div className="mb-4">
                            <h2 className="text-[18px] font-[700] text-zinc-100 tracking-tight leading-tight">
                                {member.displayName}
                            </h2>
                            <div className={cn("flex items-center gap-1.5 mt-1", status.color)}>
                                <div className={cn("w-2 h-2 rounded-full shrink-0", status.dot)} />
                                <StatusIcon className="w-3 h-3 shrink-0" />
                                <span className="text-[12px] font-medium">{status.label}</span>
                            </div>
                        </div>

                        {/* ── Stats grid ── */}
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <StatCard
                                icon={<MessageSquare className="w-3.5 h-3.5" />}
                                label="Messages"
                                value={messageCount > 0 ? String(messageCount) : "—"}
                                hint={messageCount > 0 ? "in this session" : "no messages yet"}
                            />
                            <StatCard
                                icon={<Calendar className="w-3.5 h-3.5" />}
                                label="Joined"
                                value={formatDistanceToNow(new Date(member.joinedAt), { addSuffix: false })}
                                hint="ago"
                            />
                        </div>

                        {/* ── Details list ── */}
                        <div className="space-y-2 rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
                            <DetailRow
                                icon={<Clock className="w-3 h-3" />}
                                label="Last seen"
                                value={formatDistanceToNow(new Date(member.lastSeenAt), { addSuffix: true })}
                            />
                            <DetailRow
                                icon={<Calendar className="w-3 h-3" />}
                                label="Member since"
                                value={format(new Date(member.joinedAt), "MMM d, yyyy")}
                            />
                            <DetailRow
                                icon={<Crown className="w-3 h-3" />}
                                label="Role"
                                value={isHost ? "Host" : "Member"}
                                valueClass={isHost ? "text-amber-400" : undefined}
                            />
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
    icon,
    label,
    value,
    hint,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    hint: string;
}) {
    return (
        <div className="flex flex-col gap-1 p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
            <div className="flex items-center gap-1.5 text-zinc-500">
                {icon}
                <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
            </div>
            <p className="text-[17px] font-[700] text-zinc-100 leading-none">{value}</p>
            <p className="text-[10px] text-zinc-600">{hint}</p>
        </div>
    );
}

function DetailRow({
    icon,
    label,
    value,
    valueClass,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    valueClass?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-zinc-600 shrink-0">
                {icon}
                <span className="text-[11px] font-medium text-zinc-500">{label}</span>
            </div>
            <span className={cn("text-[11px] font-medium text-zinc-300 text-right truncate", valueClass)}>
                {value}
            </span>
        </div>
    );
}
