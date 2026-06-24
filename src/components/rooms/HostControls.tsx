"use client";

import { useState } from "react";
import { useRoomStore } from "@/store/roomStore";
import { toast } from "sonner";
import type { RoomMember, SlowMode } from "@/types/rooms";
import { apiFetch } from "@/lib/api-fetch";

const SLOW_OPTIONS: { label: string; value: SlowMode }[] = [
    { label: "Off", value: "off" },
    { label: "5s", value: "5s" },
    { label: "30s", value: "30s" },
    { label: "60s", value: "60s" },
];

export default function HostControls({ roomId }: { roomId: string }) {
    const room = useRoomStore((s) => s.room);
    const members = useRoomStore((s) => s.members);
    const currentMember = useRoomStore((s) => s.currentMember);
    const [busy, setBusy] = useState(false);

    if (!room || currentMember?.userId !== room.hostId) return null;

    async function moderate(body: Record<string, unknown>) {
        setBusy(true);
        try {
            await apiFetch(`/api/rooms/${roomId}/moderate`, {
                method: "PATCH",
                body: JSON.stringify(body),
            });
        } catch (error: any) {
            toast.error(error?.message ?? "Action failed");
        } finally {
            setBusy(false);
        }
    }

    const nonHostMembers = members.filter(
        (m) => m.userId !== room.hostId && m.status !== "offline"
    );

    return (
        <div className="shrink-0 space-y-4 border-t border-zinc-800 pt-4 mt-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500/80">
                Host Controls
            </p>

            {/* Slow mode */}
            <div className="space-y-2">
                <p className="text-[11px] font-medium text-zinc-500">Slow mode</p>
                <div className="flex gap-1">
                    {SLOW_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            disabled={busy}
                            onClick={() =>
                                moderate({ action: "slow_mode", slowMode: opt.value })
                            }
                            className={[
                                "text-[11px] px-2.5 py-1 rounded border transition-colors flex-1 font-medium",
                                room.slowMode === opt.value
                                    ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                                    : "bg-zinc-800/30 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200",
                            ].join(" ")}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Per-member actions */}
            {nonHostMembers.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[11px] font-medium text-zinc-500">Members</p>
                    <ul className="space-y-1">
                        {nonHostMembers.map((m) => (
                            <MemberActions
                                key={m.$id}
                                member={m}
                                busy={busy}
                                onAction={(action) =>
                                    moderate({ action, targetUserId: m.userId })
                                }
                            />
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function MemberActions({
    member,
    busy,
    onAction,
}: {
    member: RoomMember;
    busy: boolean;
    onAction: (action: string) => void;
}) {
    const isMuted = member.status === "muted";

    return (
        <li className="flex items-center gap-1.5 text-xs">
            <span className="flex-1 truncate text-zinc-400 text-[11px]">{member.displayName}</span>
            <button
                disabled={busy}
                onClick={() => onAction(isMuted ? "unmute" : "mute")}
                className={[
                    "px-2 py-0.5 rounded border text-[10px] transition-colors font-medium",
                    isMuted
                        ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                        : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10",
                ].join(" ")}
            >
                {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
                disabled={busy}
                onClick={() => onAction("kick")}
                className="px-2 py-0.5 rounded border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-[10px] transition-colors font-medium"
            >
                Kick
            </button>
            <button
                disabled={busy}
                onClick={() => onAction("transfer")}
                className="px-2 py-0.5 rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 text-[10px] transition-colors font-medium"
            >
                Make host
            </button>
        </li>
    );
}
