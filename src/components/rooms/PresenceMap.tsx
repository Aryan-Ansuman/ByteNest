"use client";

import { useState } from "react";
import { Users, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PresenceEntry } from "@/hooks/usePresenceMap";

interface Props {
    presence: PresenceEntry[];
    /** The file currently open in this client's own editor */
    myActiveFile: string;
}

const MAX_AVATARS = 4;

export function PresenceMap({ presence, myActiveFile }: Props) {
    const [expanded, setExpanded] = useState(false);

    if (presence.length === 0) return null;

    const visible = presence.slice(0, MAX_AVATARS);
    const overflow = presence.length - visible.length;

    return (
        <div className="relative">
            <button
                onClick={() => setExpanded((v) => !v)}
                className={cn(
                    "flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-lg border transition-colors",
                    expanded
                        ? "bg-white/[0.06] border-white/10"
                        : "bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04]"
                )}
                title="Who's editing what"
            >
                <div className="flex items-center -space-x-1.5">
                    {visible.map((p) => (
                        <div
                            key={p.clientId}
                            className="w-5 h-5 rounded-full border-2 border-[#17171B] flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                            style={{ backgroundColor: p.color }}
                            title={`${p.name} — ${p.activeFile || "no file open"}`}
                        >
                            {p.name[0]?.toUpperCase() ?? "?"}
                        </div>
                    ))}
                    {overflow > 0 && (
                        <div className="w-5 h-5 rounded-full border-2 border-[#17171B] bg-zinc-700 flex items-center justify-center text-[8px] font-bold text-zinc-300 shrink-0">
                            +{overflow}
                        </div>
                    )}
                </div>
                <ChevronDown className={cn("w-3 h-3 text-zinc-500 transition-transform", expanded && "rotate-180")} />
            </button>

            {expanded && (
                <>
                    {/* Click-outside catcher */}
                    <div className="fixed inset-0 z-20" onClick={() => setExpanded(false)} />
                    <div className="absolute right-0 top-full mt-1.5 w-[240px] rounded-xl border border-white/10 bg-[#17171b] shadow-2xl shadow-black/50 z-30 overflow-hidden">
                        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                            <Users className="w-3 h-3 text-zinc-500" />
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                In this session
                            </span>
                        </div>
                        <div className="max-h-[260px] overflow-y-auto py-1" style={{ scrollbarWidth: "thin" }}>
                            {presence.map((p) => {
                                const onMyFile = p.activeFile === myActiveFile && p.activeFile !== "";
                                return (
                                    <div
                                        key={p.clientId}
                                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/[0.03] transition-colors"
                                    >
                                        <div
                                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
                                            style={{ backgroundColor: p.color }}
                                        >
                                            {p.name[0]?.toUpperCase() ?? "?"}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-[12px] font-medium text-zinc-200 truncate">
                                                {p.name}
                                                {p.isStale && (
                                                    <span className="text-zinc-600 font-normal"> · left</span>
                                                )}
                                            </p>
                                            <p
                                                className={cn(
                                                    "text-[10px] font-mono truncate",
                                                    onMyFile ? "text-[#a7c8b3]" : "text-zinc-500"
                                                )}
                                            >
                                                {p.activeFile || "no file open"}
                                            </p>
                                        </div>
                                        {onMyFile && (
                                            <div
                                                className="w-1.5 h-1.5 rounded-full bg-[#a7c8b3] shrink-0"
                                                title="Viewing the same file as you"
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
