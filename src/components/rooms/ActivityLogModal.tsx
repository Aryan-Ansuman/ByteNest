"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { format, isToday, isYesterday } from "date-fns";
import {
    X, Activity, LogIn, LogOut, UserX, Crown, Code2,
    Loader2, ShieldAlert, Volume2, VolumeX,
} from "lucide-react";
import type { RoomMessage } from "@/types/rooms";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
    roomId: string;
    onClose: () => void;
}

// Pick an icon based on the system message body — these strings match what
// the join/leave/moderate/session routes already write into room_messages.
function getEventVisual(body: string): { Icon: React.ElementType; color: string } {
    const b = body.toLowerCase();
    if (b.includes("joined"))                 return { Icon: LogIn,       color: "text-emerald-400" };
    if (b.includes("left"))                    return { Icon: LogOut,      color: "text-zinc-500" };
    if (b.includes("removed") || b.includes("kicked")) return { Icon: UserX,  color: "text-rose-400" };
    if (b.includes("now the host"))            return { Icon: Crown,       color: "text-amber-400" };
    if (b.includes("session started") || b.includes("started a"))
                                                return { Icon: Code2,       color: "text-[#a7c8b3]" };
    if (b.includes("session ended"))           return { Icon: Code2,       color: "text-zinc-500" };
    if (b.includes("muted"))                   return { Icon: VolumeX,     color: "text-amber-400" };
    if (b.includes("unmuted"))                 return { Icon: Volume2,     color: "text-emerald-400" };
    return { Icon: ShieldAlert, color: "text-zinc-500" };
}

function formatEventDay(dateStr: string): string {
    const d = new Date(dateStr);
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "MMMM d, yyyy");
}

export default function ActivityLogModal({ roomId, onClose }: Props) {
    const [events, setEvents]   = useState<RoomMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);

    useEffect(() => {
        apiFetch<{ events: RoomMessage[]; hasMore: boolean }>(`/api/rooms/${roomId}/activity`)
            .then((r) => { setEvents(r.events); setHasMore(r.hasMore); })
            .catch(() => toast.error("Failed to load activity log"))
            .finally(() => setLoading(false));
    }, [roomId]);

    async function loadMore() {
        if (loadingMore || events.length === 0) return;
        setLoadingMore(true);
        try {
            const oldest = events[events.length - 1].$createdAt;
            const r = await apiFetch<{ events: RoomMessage[]; hasMore: boolean }>(
                `/api/rooms/${roomId}/activity?before=${encodeURIComponent(oldest)}`
            );
            setEvents((prev) => [...prev, ...r.events]);
            setHasMore(r.hasMore);
        } catch {
            toast.error("Failed to load more events");
        } finally {
            setLoadingMore(false);
        }
    }

    // Group by day, preserving descending order
    const grouped: { label: string; items: RoomMessage[] }[] = [];
    for (const ev of events) {
        const label = formatEventDay(ev.$createdAt);
        const last = grouped[grouped.length - 1];
        if (last && last.label === label) last.items.push(ev);
        else grouped.push({ label, items: [ev] });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-[#111113] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <Activity className="w-4 h-4 text-[#a7c8b3]" />
                        <h2 className="text-[14px] font-semibold text-zinc-100">Activity Log</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4" style={{ scrollbarWidth: "thin" }}>
                    {loading && (
                        <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Loading activity…</span>
                        </div>
                    )}

                    {!loading && events.length === 0 && (
                        <p className="text-center text-sm text-zinc-600 py-12">
                            No room activity recorded yet.
                        </p>
                    )}

                    {grouped.map((group) => (
                        <div key={group.label} className="mb-5 last:mb-0">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-2 px-1">
                                {group.label}
                            </p>
                            <div className="space-y-0.5">
                                {group.items.map((ev) => {
                                    const { Icon, color } = getEventVisual(ev.body);
                                    return (
                                        <div
                                            key={ev.$id}
                                            className="flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.02] transition-colors"
                                        >
                                            <div className={cn("mt-0.5 shrink-0", color)}>
                                                <Icon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[12.5px] text-zinc-300 leading-relaxed">{ev.body}</p>
                                                <p className="text-[10px] text-zinc-600 mt-0.5 tabular-nums">
                                                    {format(new Date(ev.$createdAt), "h:mm a")}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}

                    {hasMore && !loading && (
                        <button
                            onClick={loadMore}
                            disabled={loadingMore}
                            className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                        >
                            {loadingMore
                                ? <><Loader2 className="w-3 h-3 animate-spin" />Loading…</>
                                : "Load earlier activity"
                            }
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
