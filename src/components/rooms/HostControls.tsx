"use client";

import { useState, useEffect } from "react";
import { useRoomStore } from "@/store/roomStore";
import { toast } from "sonner";
import type { RoomMember, SlowMode } from "@/types/rooms";
import { apiFetch } from "@/lib/api-fetch";
import { Brain, Link2, X, ExternalLink } from "lucide-react";
import NextLink from "next/link";

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

    async function moderate(body: Record<string, unknown>): Promise<boolean> {
        setBusy(true);
        try {
            await apiFetch(`/api/rooms/${roomId}/moderate`, {
                method: "PATCH",
                body: JSON.stringify(body),
            });
            return true;
        } catch (error: any) {
            toast.error(error?.message ?? "Action failed");
            return false;
        } finally {
            setBusy(false);
        }
    }

    const nonHostMembers = members.filter(
        (m) => m.userId !== room.hostId && m.status !== "offline"
    );

    return (
        <div className="shrink-0 space-y-4 border-t border-b pt-4 mt-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500/80">
                Host Controls
            </p>

            {/* Slow mode */}
            <div className="space-y-2">
                <p className="text-[11px] font-medium text-tx-muted">Slow mode</p>
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
                                    ? "bg-brand/10 border border-[#a7c8b3]/20 text-brand/20 border-indigo-500/40 text-brand"
                                    : "bg-white/[0.06]/30 border-zinc-700 text-tx-secondary hover:bg-surface-hover hover:text-tx",
                            ].join(" ")}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Socratic Debugging Mode */}
            <SocraticModeSection roomId={roomId} moderate={moderate} busy={busy} />

            {/* Linked question */}
            <LinkedQuestionSection roomId={roomId} moderate={moderate} busy={busy} />

            {/* Per-member actions */}
            {nonHostMembers.length > 0 && (
                <div className="space-y-2">
                    <p className="text-[11px] font-medium text-tx-muted">Members</p>
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
    const [confirmAction, setConfirmAction] = useState<"kick" | "transfer" | null>(null);

    function requestAction(action: string) {
        if ((action === "kick" || action === "transfer") && confirmAction !== action) {
            setConfirmAction(action);
            window.setTimeout(() => {
                setConfirmAction((current) => (current === action ? null : current));
            }, 4000);
            return;
        }

        setConfirmAction(null);
        onAction(action);
    }

    return (
        <li className="flex items-center gap-1.5 text-xs">
            <span className="flex-1 truncate text-tx-secondary text-[11px]">{member.displayName}</span>
            <button
                disabled={busy}
                onClick={() => requestAction(isMuted ? "unmute" : "mute")}
                className={[
                    "px-2 py-0.5 rounded border text-[10px] transition-colors font-medium",
                    isMuted
                        ? "border-[#22c55e]/30 text-status-success hover:bg-status-success/10"
                        : "border-amber-500/30 text-amber-400 hover:bg-amber-500/10",
                ].join(" ")}
            >
                {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
                disabled={busy}
                onClick={() => requestAction("kick")}
                className="px-2 py-0.5 rounded border border-[#ef4444]/30 text-status-danger hover:bg-status-danger/10 text-[10px] transition-colors font-medium"
            >
                {confirmAction === "kick" ? "Confirm" : "Kick"}
            </button>
            <button
                disabled={busy}
                onClick={() => requestAction("transfer")}
                className="px-2 py-0.5 rounded border border-zinc-700 text-tx-secondary hover:bg-surface-hover text-[10px] transition-colors font-medium"
            >
                {confirmAction === "transfer" ? "Confirm" : "Make host"}
            </button>
        </li>
    );
}

function SocraticModeSection({
    roomId,
    moderate,
    busy,
}: {
    roomId: string;
    moderate: (body: Record<string, unknown>) => Promise<boolean>;
    busy: boolean;
}) {
    const room = useRoomStore((s) => s.room);
    const members = useRoomStore((s) => s.members);
    const [selectedSeekerId, setSelectedSeekerId] = useState("");
    const [elapsedMinutes, setElapsedMinutes] = useState(0);

    const socraticMode = room?.socraticMode ?? false;
    const socraticStartedAt = room?.socraticStartedAt ?? null;

    // Live-updating session duration while Socratic mode is active
    useEffect(() => {
        if (!socraticMode || !socraticStartedAt) return;

        const tick = () => {
            const startedMs = new Date(socraticStartedAt).getTime();
            setElapsedMinutes(Math.max(0, Math.floor((Date.now() - startedMs) / 60000)));
        };

        tick();
        const interval = window.setInterval(tick, 30000);
        return () => window.clearInterval(interval);
    }, [socraticMode, socraticStartedAt]);

    if (!room) return null;

    const onlineNonHost = members.filter(
        (m) => m.userId !== room.hostId && m.status !== "offline"
    );

    async function startSocraticMode() {
        if (!selectedSeekerId) return;
        const ok = await moderate({
            action: "socratic_mode",
            enabled: true,
            seekerId: selectedSeekerId,
        });
        if (ok) setSelectedSeekerId("");
    }

    async function endSocraticMode() {
        await moderate({ action: "socratic_mode", enabled: false });
    }

    const seekerName = members.find((m) => m.userId === room.socraticSeekerId)?.displayName ?? "Seeker";

    return (
        <div className="space-y-2">
            <p className="text-[11px] font-medium text-tx-muted flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-amber-400" />
                Socratic Mode
            </p>

            {room.socraticMode ? (
                <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
                    <div className="flex items-center gap-1.5 text-[12px] text-amber-300 font-medium">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                        </span>
                        🔍 {seekerName} is the seeker
                    </div>
                    <p className="text-[11px] text-amber-400/70">
                        Active for {elapsedMinutes} {elapsedMinutes === 1 ? "minute" : "minutes"}
                    </p>
                    <button
                        disabled={busy}
                        onClick={endSocraticMode}
                        className="w-full text-[11px] px-2.5 py-1.5 rounded border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors font-medium"
                    >
                        End Socratic Mode
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <select
                        disabled={busy || onlineNonHost.length === 0}
                        value={selectedSeekerId}
                        onChange={(e) => setSelectedSeekerId(e.target.value)}
                        className="w-full bg-black/30 border border-zinc-700 rounded text-[11px] px-2 py-1.5 text-tx-secondary outline-none focus:border-amber-500/40 disabled:opacity-50"
                    >
                        <option value="">
                            {onlineNonHost.length === 0 ? "No online members" : "Designate seeker…"}
                        </option>
                        {onlineNonHost.map((m) => (
                            <option key={m.$id} value={m.userId}>
                                {m.displayName}
                            </option>
                        ))}
                    </select>
                    <button
                        disabled={busy || !selectedSeekerId}
                        onClick={startSocraticMode}
                        className={[
                            "w-full text-[11px] px-2.5 py-1.5 rounded border transition-colors font-medium",
                            selectedSeekerId
                                ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                                : "border-zinc-700 text-tx-disabled cursor-not-allowed",
                        ].join(" ")}
                    >
                        Start Socratic Mode
                    </button>
                </div>
            )}
        </div>
    );
}

function LinkedQuestionSection({
    roomId,
    moderate,
    busy,
}: {
    roomId: string;
    moderate: (body: Record<string, unknown>) => Promise<boolean>;
    busy: boolean;
}) {
    const room = useRoomStore((s) => s.room);
    const [input, setInput] = useState("");
    const [linking, setLinking] = useState(false);

    if (!room) return null;

    // Accepts either a raw question ID or a full ByteNest question URL
    // (e.g. https://.../questions/<id> or /question/<id>).
    function extractQuestionId(raw: string): string {
        const trimmed = raw.trim();
        const match = trimmed.match(/\/questions?\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : trimmed;
    }

    async function linkQuestion() {
        const questionId = extractQuestionId(input);
        if (!questionId) return;
        setLinking(true);
        const ok = await moderate({ action: "link_question", questionId });
        setLinking(false);
        if (ok) setInput("");
    }

    async function unlinkQuestion() {
        await moderate({ action: "link_question", questionId: null });
    }

    return (
        <div className="space-y-2">
            <p className="text-[11px] font-medium text-tx-muted flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
                Linked Question <span className="text-tx-disabled font-normal">(optional)</span>
            </p>
            <p className="text-[10px] text-tx-disabled leading-relaxed">
                Root cause will be auto-saved as an answer.
            </p>

            {room.linkedQuestionId ? (
                <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-surface p-2.5">
                    <span className="flex-1 min-w-0 truncate text-[11px] text-tx-secondary">
                        {room.linkedQuestionTitle ?? room.linkedQuestionId}
                    </span>
                    <NextLink
                        href={`/questions/${room.linkedQuestionId}`}
                        target="_blank"
                        className="p-1 rounded text-tx-muted hover:text-brand transition-colors"
                    >
                        <ExternalLink className="w-3 h-3" />
                    </NextLink>
                    <button
                        disabled={busy}
                        onClick={unlinkQuestion}
                        className="p-1 rounded text-tx-muted hover:text-status-danger transition-colors"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            ) : (
                <div className="flex gap-1.5">
                    <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") linkQuestion();
                        }}
                        placeholder="Question ID or URL…"
                        className="flex-1 min-w-0 bg-black/30 border border-zinc-700 rounded text-[11px] px-2 py-1.5 text-tx-secondary placeholder-zinc-600 outline-none focus:border-[#a7c8b3]/40"
                    />
                    <button
                        disabled={busy || linking || !input.trim()}
                        onClick={linkQuestion}
                        className="px-2.5 py-1.5 rounded border border-zinc-700 text-[11px] text-tx-secondary hover:bg-surface-hover transition-colors font-medium disabled:opacity-50"
                    >
                        Link
                    </button>
                </div>
            )}
        </div>
    );
}
