"use client";

import { useState } from "react";
import { useRoomStore } from "@/store/roomStore";
import type { RoomMember } from "@/types/rooms";
import { Search, ChevronDown, ChevronRight, UserPlus, Crown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MemberContextMenu } from "./MemberContextMenu";

const AVATAR_COLORS: Record<string, string> = {
    indigo:  "bg-indigo-500",
    violet:  "bg-violet-500",
    emerald: "bg-status-success",
    amber:   "bg-amber-500",
    rose:    "bg-status-danger",
    cyan:    "bg-cyan-500",
};

interface Props {
    roomId: string;
}

export default function MemberSidebar({ roomId }: Props) {
    const room          = useRoomStore((s) => s.room);
    const members       = useRoomStore((s) => s.members);
    const currentMember = useRoomStore((s) => s.currentMember);

    const [searchQuery, setSearchQuery] = useState("");
    const [openSections, setOpenSections] = useState({
        online:  true,
        muted:   true,
        away:    true,
        offline: false,
    });

    function toggleSection(key: keyof typeof openSections) {
        setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
    }

    // ── Fix 2: wire invite button ─────────────────────────────────────────
    async function copyInvite() {
        if (!room) return;
        const link = room.inviteToken
            ? `${window.location.origin}/rooms/join/${room.inviteToken}`
            : window.location.href;
        await navigator.clipboard.writeText(link);
        toast.success("Invite link copied to clipboard");
    }

    const filtered = members.filter((m) =>
        m.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const isHost        = (member: RoomMember) => member.userId === room?.hostId;
    const iAmHost       = currentMember?.userId === room?.hostId;

    const online  = filtered.filter((m) => m.status === "online");
    const muted   = filtered.filter((m) => m.status === "muted");
    const away    = filtered.filter((m) => m.status === "away");
    const offline = filtered.filter((m) => m.status === "offline");

    const onlineCount = online.length + muted.length + away.length;
    const totalCount  = members.length;

    return (
        <div className="flex flex-col h-full bg-[#111113]">
            {/* Header */}
            <div className="shrink-0 px-6 py-6 border-b border-white/5">
                <div className="flex items-center justify-between mb-2 px-1">
                    <h2 className="text-[15px] font-[600] text-zinc-200">
                        Members{" "}
                        <span className="text-zinc-500 ml-1 font-medium text-[12px]">
                            {onlineCount} / {totalCount}
                        </span>
                    </h2>
                    {/* Fix 2: invite button wired */}
                    <button
                        onClick={copyInvite}
                        className="p-1 text-tx-muted hover:text-[#a7c8b3] transition-colors"
                        title="Copy invite link"
                    >
                        <UserPlus className="w-3.5 h-3.5" />
                    </button>
                </div>

                <div className="relative group">
                    <Search className="w-3.5 h-3.5 text-tx-muted absolute left-2.5 top-1/2 -translate-y-1/2 group-focus-within:text-[#a7c8b3] transition-colors" />
                    <input
                        type="text"
                        placeholder="Search members..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#18181b] border border-white/5 rounded-[14px] py-2 pl-8 pr-3 text-[13px] text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-[#a7c8b3] focus:ring-1 focus:ring-[#a7c8b3] caret-[#a7c8b3] transition-all shadow-sm"
                    />
                </div>
            </div>

            {/* List */}
            <div
                className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}
            >
                {online.length > 0 && (
                    <MemberSection
                        title="Online"
                        members={online}
                        isHostFn={isHost}
                        currentUserId={currentMember?.userId}
                        iAmHost={iAmHost}
                        roomId={roomId}
                        isOpen={openSections.online}
                        onToggle={() => toggleSection("online")}
                    />
                )}
                {muted.length > 0 && (
                    <MemberSection
                        title="Muted"
                        members={muted}
                        isHostFn={isHost}
                        currentUserId={currentMember?.userId}
                        iAmHost={iAmHost}
                        roomId={roomId}
                        isOpen={openSections.muted}
                        onToggle={() => toggleSection("muted")}
                        accent="rose"
                    />
                )}
                {away.length > 0 && (
                    <MemberSection
                        title="Away"
                        members={away}
                        isHostFn={isHost}
                        currentUserId={currentMember?.userId}
                        iAmHost={iAmHost}
                        roomId={roomId}
                        isOpen={openSections.away}
                        onToggle={() => toggleSection("away")}
                        accent="amber"
                    />
                )}
                {offline.length > 0 && (
                    <MemberSection
                        title="Offline"
                        members={offline}
                        isHostFn={isHost}
                        currentUserId={currentMember?.userId}
                        iAmHost={iAmHost}
                        roomId={roomId}
                        isOpen={openSections.offline}
                        onToggle={() => toggleSection("offline")}
                        dimmed
                    />
                )}
            </div>
        </div>
    );
}

// ─── Section ──────────────────────────────────────────────────────────────────

function MemberSection({
    title, members, isHostFn, currentUserId, iAmHost, roomId,
    isOpen, onToggle, accent, dimmed,
}: {
    title: string;
    members: RoomMember[];
    isHostFn: (m: RoomMember) => boolean;
    currentUserId?: string;
    iAmHost?: boolean;
    roomId: string;
    isOpen: boolean;
    onToggle: () => void;
    accent?: "rose" | "amber";
    dimmed?: boolean;
}) {
    return (
        <div>
            <button
                onClick={onToggle}
                className="w-full flex items-center gap-2 px-1 py-1.5 mb-1.5 rounded text-left hover:bg-zinc-800/40 transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.98] group"
            >
                {isOpen
                    ? <ChevronDown className="w-3 h-3 text-tx-disabled group-hover:text-tx-secondary" />
                    : <ChevronRight className="w-3 h-3 text-tx-disabled group-hover:text-tx-secondary" />
                }
                <h3 className={cn(
                    "text-[13px] font-semibold",
                    accent === "rose"  ? "text-status-danger/80" :
                    accent === "amber" ? "text-amber-400/80" :
                    "text-tx-secondary"
                )}>
                    {title} — {members.length}
                </h3>
            </button>

            {isOpen && (
                <div className="space-y-1.5 px-1">
                    {members.map((member, index) => {
                        const isMe     = member.userId === currentUserId;
                        const isOnline = !dimmed && member.status === "online";

                        return (
                            // Fix 11: group class lets MemberContextMenu trigger appear on hover
                            <div
                                key={member.userId}
                                onClick={(e) => {
                                    // Don't trigger if they clicked the context menu button itself
                                    if ((e.target as HTMLElement).closest('button')) return;
                                    
                                    if (iAmHost && !isMe) {
                                        document.getElementById(`menu-trigger-${member.userId}`)?.click();
                                    } else {
                                        toast.info(`Profile for ${member.displayName} coming soon!`);
                                    }
                                }}
                                className={cn(
                                    "relative flex items-center gap-3 p-3 rounded-[14px] bg-[#18181b] border border-white/5 group transition-all duration-150 shadow-sm",
                                    dimmed ? "opacity-50 grayscale hover:grayscale-0 hover:opacity-100" : "",
                                    "hover:bg-white/[0.03] hover:-translate-y-0.5 active:scale-[1.01] cursor-pointer"
                                )}
                            >
                                {/* Avatar */}
                                <div className="relative shrink-0">
                                    <div className={cn(
                                        "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                                        AVATAR_COLORS[member.avatarColor] ?? "bg-zinc-600"
                                    )}>
                                        {member.displayName[0]?.toUpperCase()}
                                    </div>
                                    {isOnline && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#a7c8b3] border-2 border-[#111113] rounded-full shadow-[0_0_8px_rgba(167,200,179,0.3)]" />
                                    )}
                                    {!dimmed && member.status === "away" && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-500 border-2 border-[#111113] rounded-full" />
                                    )}
                                </div>

                                {/* Name + host badge */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[13px] font-[600] text-zinc-100 truncate">
                                            {member.displayName}
                                        </span>
                                        {isHostFn(member) && (
                                            <span className="shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/10" title="Host">
                                                <Crown className="w-2.5 h-2.5 text-amber-500" />
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Badges (YOU / BOT) */}
                                <div className="shrink-0 flex flex-col items-end gap-1">
                                    {isMe && (
                                        <span className="px-1.5 py-[1px] rounded-[6px] bg-[#a7c8b3]/10 border border-[#a7c8b3]/20 text-[10px] font-[600] text-[#a7c8b3] tracking-wide">
                                            YOU
                                        </span>
                                    )}
                                    {member.isAI && (
                                        <span className="px-1.5 py-[1px] rounded-[6px] bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-[600] text-indigo-400 tracking-wide">
                                            BOT
                                        </span>
                                    )}
                                </div>

                                {/* Fix 1: MemberContextMenu replaces dead hover buttons */}
                                {!isMe && (
                                    <MemberContextMenu
                                        member={member}
                                        roomId={roomId}
                                        isHost={!!iAmHost}
                                        currentUserId={currentUserId ?? ""}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
