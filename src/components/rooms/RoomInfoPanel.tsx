"use client";

import { useRoomStore } from "@/store/roomStore";
import type { DiscussionRoom } from "@/types/rooms";
import {
    X, Globe, Lock, Users, Hash, Timer, Calendar, Code2,
    MessageSquare, Clock, Copy, UserPlus, Share2, Shield,
    BarChart2, Info, Crown,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
    room: DiscussionRoom;
    onClose: () => void;
}

const SLOW_MODE_LABEL: Record<string, string> = {
    off: "Disabled",
    "5s": "5 seconds",
    "30s": "30 seconds",
    "60s": "60 seconds",
};

export default function RoomInfoPanel({ room, onClose }: Props) {
    const members       = useRoomStore((s) => s.members);
    const messages      = useRoomStore((s) => s.messages);
    const codeSession   = useRoomStore((s) => s.codeSession);
    const currentMember = useRoomStore((s) => s.currentMember);

    const isHost         = currentMember?.userId === room.hostId;
    const onlineCount    = members.filter((m) => m.status === "online" || m.status === "muted").length;
    const hostMember     = members.find((m) => m.userId === room.hostId);
    const capacity       = room.maxMembers > 0 ? onlineCount / room.maxMembers : 0;
    const messageCount   = messages.filter((m) => m.type !== "system").length;

    async function copyInvite() {
        const link = room.inviteToken
            ? `${window.location.origin}/rooms/join/${room.inviteToken}`
            : window.location.href;
        await navigator.clipboard.writeText(link);
        toast.success("Invite link copied");
    }

    async function copyRoomUrl() {
        await navigator.clipboard.writeText(window.location.href);
        toast.success("Room URL copied");
    }

    return (
        <div className="h-full flex flex-col bg-panel overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}>

            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-4 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                    <Info className="w-4 h-4 text-brand" />
                    <h2 className="text-[14px] font-semibold text-tx">Room Info & Settings</h2>
                </div>
                <button
                    onClick={onClose}
                    className="p-1.5 text-tx-muted hover:text-tx-secondary hover:bg-zinc-800/40 rounded-lg transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="flex-1 px-4 py-4 space-y-5">

                {/* Room identity */}
                <section>
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-brand/10 border border-[#a7c8b3]/20 flex items-center justify-center text-lg font-bold text-brand shrink-0">
                            {room.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-[14px] font-semibold text-tx mb-0.5">{room.name}</h3>
                            <p className="text-[12px] text-tx-secondary max-w-[200px] truncate">{room.id}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                                {room.visibility === "private"
                                    ? <Lock className="w-3 h-3 text-tx-disabled" />
                                    : <Globe className="w-3 h-3 text-tx-disabled" />
                                }
                                <span className="text-[11px] text-tx-muted capitalize">{room.visibility}</span>
                            </div>
                        </div>
                    </div>

                    {room.description && (
                        <p className="mt-3 text-[12px] text-tx-muted leading-relaxed">
                            {room.description}
                        </p>
                    )}

                    {room.tags && room.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {room.tags.map((t) => (
                                <span
                                    key={t}
                                    className="flex items-center gap-0.5 px-2 py-0.5 rounded-md border border-white/5 bg-white/[0.03] text-[10px] text-tx-muted"
                                >
                                    <Hash className="w-2.5 h-2.5" />
                                    {t}
                                </span>
                            ))}
                        </div>
                    )}
                </section>

                {/* Stats */}
                <section>
                    <SectionLabel>Stats</SectionLabel>
                    <div className="grid grid-cols-2 gap-3">
                        <StatCard
                            icon={<Users className="w-3.5 h-3.5" />}
                            label="Online"
                            value={`${onlineCount} / ${room.maxMembers}`}
                        />
                        <StatCard
                            icon={<MessageSquare className="w-3.5 h-3.5" />}
                            label="Messages"
                            value={String(messageCount)}
                        />
                        <StatCard
                            icon={<BarChart2 className="w-3.5 h-3.5" />}
                            label="Capacity"
                            value={`${Math.round(capacity * 100)}%`}
                            accent={capacity > 0.8 ? "rose" : capacity > 0.5 ? "amber" : "green"}
                        />
                        <StatCard
                            icon={<Code2 className="w-3.5 h-3.5" />}
                            label="Code session"
                            value={codeSession ? "Active" : "None"}
                            accent={codeSession ? "green" : undefined}
                        />
                    </div>

                    {/* Capacity bar */}
                    <div className="mt-3 space-y-1.5">
                        <div className="flex justify-between text-[12px] text-tx-muted">
                            <span>Capacity</span>
                            <span>{onlineCount}/{room.maxMembers}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                            <div
                                className={cn(
                                    "h-full rounded-full transition-all",
                                    capacity > 0.8 ? "bg-status-danger" : capacity > 0.5 ? "bg-amber-500" : "bg-status-success"
                                )}
                                style={{ width: `${Math.min(100, capacity * 100)}%` }}
                            />
                        </div>
                    </div>
                </section>

                {/* Host */}
                {hostMember && (
                    <section>
                        <SectionLabel>Host</SectionLabel>
                        <div className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-surface">
                            <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-sm font-bold text-tx shrink-0">
                                {hostMember.displayName[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-semibold text-tx flex items-center gap-1.5">
                                    {hostMember.displayName}
                                    <Crown className="w-3.5 h-3.5 text-amber-400" />
                                </p>
                                <p className="text-[11px] text-tx-muted">Room creator</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* Settings */}
                <section>
                    <SectionLabel>Settings</SectionLabel>
                    <div className="space-y-2">
                        <SettingRow
                            icon={<Timer className="w-4 h-4" />}
                            label="Slow mode"
                            value={SLOW_MODE_LABEL[room.slowMode] ?? "Disabled"}
                        />
                        <SettingRow
                            icon={room.visibility === "private" ? <Lock className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                            label="Visibility"
                            value={room.visibility === "private" ? "Private" : "Public"}
                            capitalize
                        />
                        <SettingRow
                            icon={<Users className="w-4 h-4" />}
                            label="Capacity"
                            value={`${room.maxMembers} members`}
                        />
                    </div>
                </section>

                {/* Share */}
                <section>
                    <SectionLabel>Share</SectionLabel>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={copyInvite}
                            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/5 bg-surface hover:bg-surface-hover hover:border-zinc-700 transition-colors"
                        >
                            <UserPlus className="w-5 h-5 text-tx-secondary" />
                            <span className="text-[11px] font-medium text-tx-secondary">Copy Invite</span>
                        </button>
                        <button
                            onClick={copyRoomUrl}
                            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/5 bg-surface hover:bg-surface-hover hover:border-zinc-700 transition-colors"
                        >
                            <Share2 className="w-5 h-5 text-tx-secondary" />
                            <span className="text-[11px] font-medium text-tx-secondary">Copy Link</span>
                        </button>
                    </div>
                </section>

            </div>
        </div>
    );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-[13px] font-semibold text-tx-secondary mb-3 px-1">
            {children}
        </h3>
    );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode, label: string, value: string, accent?: "green" | "amber" | "rose" }) {
    return (
        <div className="p-3 rounded-xl border border-white/5 bg-surface flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-tx-muted">
                {icon}
                <span className="text-[11px] font-medium">{label}</span>
            </div>
            <p className={cn(
                "text-[15px] font-bold",
                accent === "green" ? "text-status-success" :
                accent === "amber" ? "text-amber-400" :
                accent === "rose" ? "text-status-danger" :
                "text-tx"
            )}>
                {value}
            </p>
        </div>
    );
}

function SettingRow({ icon, label, value, capitalize }: { icon: React.ReactNode, label: string, value: string, capitalize?: boolean }) {
    return (
        <div className="flex items-center justify-between p-2.5 rounded-lg hover:bg-surface-hover transition-colors">
            <div className="flex items-center gap-2.5 text-tx-secondary">
                {icon}
                <span className="text-[12px]">{label}</span>
            </div>
            <span className={cn("text-[12px] font-medium text-tx", capitalize && "capitalize")}>
                {value}
            </span>
        </div>
    );
}
