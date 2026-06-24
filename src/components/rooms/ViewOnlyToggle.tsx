"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2 } from "lucide-react";
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

    if (!isHost || !sessionId) return null;

    const current = optimistic ?? viewOnly;
    const isBusy = loading?.startsWith("view_only") ?? false;

    async function handleToggle() {
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

    return (
        <button
            onClick={handleToggle}
            disabled={isBusy}
            title={
                current
                    ? "Disable view-only (allow edits)"
                    : "Enable view-only (read-only for members)"
            }
            className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-all hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-40 select-none"
        >
            {/* icon */}
            {isBusy ? (
                <Loader2 size={12} className="animate-spin shrink-0" />
            ) : current ? (
                <Eye size={12} className="shrink-0 text-amber-400" />
            ) : (
                <EyeOff size={12} className="shrink-0" />
            )}

            {/* label */}
            <span className="leading-none">
                {current ? "View only" : "Editable"}
            </span>

            {/* pill */}
            <div
                className={`relative h-4 w-7 shrink-0 rounded-full border transition-colors duration-150 ${
                    current
                        ? "border-amber-500/30 bg-amber-500/20"
                        : "border-zinc-700 bg-zinc-800"
                }`}
            >
                <motion.div
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    className={`absolute top-0.5 h-3 w-3 rounded-full transition-colors duration-150 ${
                        current ? "bg-amber-400" : "bg-zinc-500"
                    }`}
                    style={{ left: current ? "calc(100% - 14px)" : "2px" }}
                />
            </div>
        </button>
    );
}
