"use client";

import { useEffect, useState } from "react";
import { Pin, X, Loader2 } from "lucide-react";
import { useRoomStore } from "@/store/roomStore";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import type { RoomMessage } from "@/types/rooms";

interface Props {
    roomId: string;
    onJumpTo?: (messageId: string) => void;
}

export default function PinnedMessageBar({ roomId, onJumpTo }: Props) {
    const room           = useRoomStore((s) => s.room);
    const messages        = useRoomStore((s) => s.messages);
    const currentMember   = useRoomStore((s) => s.currentMember);

    const [pinned, setPinned]     = useState<RoomMessage | null>(null);
    const [unpinning, setUnpinning] = useState(false);

    const pinnedId = room?.pinnedMessageId;
    const isHost   = currentMember?.userId === room?.hostId;

    useEffect(() => {
        if (!pinnedId) { setPinned(null); return; }

        // Prefer the in-store copy if we already have it (keeps edits/reactions live)
        const local = messages.find((m) => m.$id === pinnedId);
        if (local) { setPinned(local); return; }

        apiFetch<{ message: RoomMessage }>(`/api/rooms/${roomId}/messages/${pinnedId}`)
            .then((res) => setPinned(res.message))
            .catch(() => setPinned(null));
    }, [pinnedId, messages, roomId]);

    async function handleUnpin() {
        setUnpinning(true);
        try {
            await apiFetch(`/api/rooms/${roomId}/moderate`, {
                method: "PATCH",
                body: JSON.stringify({ action: "unpin" }),
            });
        } catch {
            toast.error("Failed to unpin message");
        } finally {
            setUnpinning(false);
        }
    }

    if (!pinnedId || !pinned) return null;

    return (
        <div className="shrink-0 flex items-center gap-2.5 px-4 py-2 bg-[#a7c8b3]/[0.06] border-b border-[#a7c8b3]/15">
            <Pin className="w-3.5 h-3.5 text-[#a7c8b3] shrink-0" />
            <button
                onClick={() => onJumpTo?.(pinned.$id)}
                className="flex-1 min-w-0 flex items-baseline gap-2 text-left"
            >
                <span className="text-[12px] font-semibold text-[#a7c8b3] shrink-0">{pinned.authorName}</span>
                <span className="text-[12px] text-zinc-400 truncate">
                    {pinned.deletedAt ? "Message deleted" : pinned.body}
                </span>
            </button>
            {isHost && (
                <button
                    onClick={handleUnpin}
                    disabled={unpinning}
                    className="shrink-0 p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors disabled:opacity-50"
                    title="Unpin message"
                >
                    {unpinning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                </button>
            )}
        </div>
    );
}
