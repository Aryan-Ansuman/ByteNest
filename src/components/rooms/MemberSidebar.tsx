"use client";
import { useRoomStore } from "@/store/roomStore";
import HostControls from "./HostControls";
import { MemberContextMenu } from "./MemberContextMenu";

const COLOR_MAP: Record<string, string> = {
    indigo: "bg-indigo-500",
    violet: "bg-violet-500",
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
    cyan: "bg-cyan-500",
};

const STATUS_DOT: Record<string, string> = {
    online: "bg-emerald-400",
    away: "bg-amber-400",
    offline: "bg-zinc-600",
    muted: "bg-rose-500",
};

const STATUS_LABEL: Record<string, string> = {
    online: "Online",
    away: "Away",
    offline: "Offline",
    muted: "Muted",
};

export default function MemberSidebar({ roomId }: { roomId: string }) {
    const members = useRoomStore((s) => s.members);
    const room = useRoomStore((s) => s.room);

    const online = members.filter((m) => m.status === "online");
    const muted = members.filter((m) => m.status === "muted");
    const away = members.filter((m) => m.status === "away");
    const offline = members.filter((m) => m.status === "offline");

    const currentMember = useRoomStore((s) => s.currentMember);

    return (
        <div className="p-3 space-y-5 flex flex-col h-full">
            <div className="flex-1 space-y-5 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                <Section
                    label="Online"
                    count={online.length}
                    members={online}
                    hostId={room?.hostId}
                    roomId={roomId}
                    currentUserId={currentMember?.userId}
                />
                {muted.length > 0 && (
                    <Section
                        label="Muted"
                        count={muted.length}
                        members={muted}
                        hostId={room?.hostId}
                        roomId={roomId}
                        currentUserId={currentMember?.userId}
                    />
                )}
                {away.length > 0 && (
                    <Section
                        label="Away"
                        count={away.length}
                        members={away}
                        hostId={room?.hostId}
                        roomId={roomId}
                        currentUserId={currentMember?.userId}
                    />
                )}
                {offline.length > 0 && (
                    <Section
                        label="Offline"
                        count={offline.length}
                        members={offline}
                        hostId={room?.hostId}
                        roomId={roomId}
                        currentUserId={currentMember?.userId}
                        dimmed
                    />
                )}

                {members.length === 0 && (
                    <p className="text-xs text-zinc-600 text-center py-4">
                        No members online
                    </p>
                )}
            </div>
            
            <HostControls roomId={roomId} />
        </div>
    );
}

function Section({
    label,
    count,
    members,
    hostId,
    roomId,
    currentUserId,
    dimmed = false,
}: {
    label: string;
    count: number;
    members: ReturnType<typeof useRoomStore.getState>["members"];
    hostId?: string;
    roomId: string;
    currentUserId?: string;
    dimmed?: boolean;
}) {
    if (count === 0) return null;
    return (
        <section>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
                {label} — {count}
            </p>
            <ul className="space-y-0.5">
                {members.map((m) => (
                    <MemberRow
                        key={m.$id}
                        member={m}
                        isHost={m.userId === hostId}
                        roomId={roomId}
                        currentUserId={currentUserId}
                        dimmed={dimmed}
                    />
                ))}
            </ul>
        </section>
    );
}

function MemberRow({
    member,
    isHost,
    roomId,
    currentUserId,
    dimmed,
}: {
    member: ReturnType<typeof useRoomStore.getState>["members"][0];
    isHost: boolean;
    roomId: string;
    currentUserId?: string;
    dimmed: boolean;
}) {
    const room = useRoomStore((s) => s.room);
    const currentUserIsHost = room?.hostId === currentUserId;

    return (
        <li
            className={[
                "group flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-800/50 transition-colors",
                dimmed ? "opacity-50 grayscale-[0.3]" : "",
            ].join(" ")}
        >
            {/* Avatar */}
            <div className="relative shrink-0">
                <div
                    className={[
                        "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white",
                        COLOR_MAP[member.avatarColor] ?? "bg-indigo-500",
                    ].join(" ")}
                >
                    {member.displayName[0]?.toUpperCase() ?? "?"}
                </div>
                <span
                    className={[
                        "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0a]",
                        STATUS_DOT[member.status] ?? "bg-zinc-600",
                    ].join(" ")}
                    title={STATUS_LABEL[member.status]}
                />
            </div>

            {/* Name */}
            <span className="text-xs text-zinc-300 truncate flex-1 font-medium">
                {member.displayName}
            </span>

            {/* Badges / Actions */}
            <div className="flex items-center gap-1 shrink-0">
                {isHost && (
                    <span className="text-[10px] text-amber-400 font-semibold tracking-wide">
                        HOST
                    </span>
                )}
                {member.status === "muted" && (
                    <span className="text-[10px] text-rose-400 font-medium">
                        MUTED
                    </span>
                )}
                <MemberContextMenu
                    member={member}
                    roomId={roomId}
                    isHost={currentUserIsHost}
                    currentUserId={currentUserId ?? ""}
                />
            </div>
        </li>
    );
}
