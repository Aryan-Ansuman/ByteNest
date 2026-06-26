"use client";

import { useEffect, useState } from "react";
import { Loader2, Pen, Lock } from "lucide-react";
import { useHostControls } from "@/hooks/useHostControls";

interface Props {
    roomId: string;
    /** null when no session is active — renders nothing */
    sessionId: string | null;
    /** True only when the viewing user is the host */
    isHost: boolean;
    /** Authoritative value from the store (kept in sync by Realtime) */
    viewOnly: boolean;
}

/**
 * Toggle rendered in the code session toolbar.
 * Only visible to the host while a session is active.
 *
 * Uses an optimistic boolean that immediately reflects the click, then
 * resets to let the store prop (driven by Realtime) be the source of truth.
 * On API error the optimistic value reverts.
 */
export function ViewOnlyToggle({ roomId, sessionId, isHost, viewOnly }: Props) {
    const { loading, setViewOnly } = useHostControls(roomId);
    const [optimistic, setOptimistic] = useState<boolean | null>(null);

    // when the Realtime-driven prop settles, clear the optimistic override
    useEffect(() => {
        setOptimistic(null);
    }, [viewOnly]);

    if (!sessionId) return null;

    const current = optimistic ?? viewOnly;
    const isBusy = loading?.startsWith("view_only") ?? false;

    async function handleToggle() {
        if (!isHost) return;
        const next = !current;
        setOptimistic(next); // immediate feedback
        try {
            await setViewOnly(next);
            // optimistic stays until the Realtime event updates the prop and the
            // useEffect above fires — avoids a flicker back to the old value
        } catch {
            setOptimistic(null); // revert on error
        }
    }

    if (!isHost) {
        return (
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium select-none bg-white/[0.03] border border-white/[0.05] ${
                current ? "text-[#E2C792]" : "text-[#A7C8B3]"
            }`}>
                {current ? <Lock size={12} className="shrink-0" /> : <Pen size={12} className="shrink-0" />}
                <span className="leading-none">{current ? "View Only" : "Live Editing"}</span>
            </div>
        );
    }

    return (
        <button
            onClick={handleToggle}
            disabled={isBusy}
            title={current ? "Disable view-only (allow edits)" : "Enable view-only (read-only for members)"}
            className={`group relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150 select-none overflow-hidden bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] ${
                current ? "text-[#E2C792]" : "text-[#A7C8B3]"
            } ${isBusy ? "opacity-60 cursor-not-allowed" : "cursor-pointer active:scale-95"}`}
        >
            {isBusy ? (
                <Loader2 size={12} className="animate-spin shrink-0 text-zinc-400" />
            ) : (
                <>
                    {current ? <Lock size={12} className="shrink-0" /> : <Pen size={12} className="shrink-0" />}
                    <span className="leading-none">{current ? "View Only" : "Live Editing"}</span>
                </>
            )}
            
            <div className={`w-1 h-1 rounded-full ml-1 ${current ? "bg-[#E2C792]/50" : "bg-[#A7C8B3]/50"}`} />
        </button>
    );
}
