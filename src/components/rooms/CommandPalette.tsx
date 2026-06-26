"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRoomStore } from "@/store/roomStore";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
    Command, MessageSquare, Users, Code2, Info, Maximize2, Minimize2,
    LogOut, Copy, UserPlus, Timer, Volume2, VolumeX, Search,
    ArrowRight, Hash, Keyboard, ChevronRight, Radio,
} from "lucide-react";
import type { SlowMode } from "@/types/rooms";

type PanelId = "chat" | "code" | "members" | "info";

interface CommandItem {
    id: string;
    label: string;
    description?: string;
    icon: React.ReactNode;
    shortcut?: string;
    action: () => void;
    group: string;
    keywords: string[];
}

interface Props {
    roomId: string;
    onClose: () => void;
    onTogglePanel: (id: PanelId) => void;
    hiddenPanels: Set<PanelId>;
    onToggleFocus: () => void;
    focusMode: boolean;
}

export default function CommandPalette({
    roomId, onClose, onTogglePanel, hiddenPanels, onToggleFocus, focusMode,
}: Props) {
    const router        = useRouter();
    const room          = useRoomStore((s) => s.room);
    const currentMember = useRoomStore((s) => s.currentMember);
    const codeSession   = useRoomStore((s) => s.codeSession);

    const [query,     setQuery    ] = useState("");
    const [cursor,    setCursor   ] = useState(0);
    const inputRef                  = useRef<HTMLInputElement>(null);
    const listRef                   = useRef<HTMLUListElement>(null);

    const isHost = currentMember?.userId === room?.hostId;

    // Focus input on mount
    useEffect(() => { inputRef.current?.focus(); }, []);

    // Build command list
    const COMMANDS: CommandItem[] = [
        // ── Navigation ──────────────────────────────────────────────────
        {
            id: "back-rooms",
            group: "Navigate",
            label: "Back to Rooms",
            icon: <Hash className="w-4 h-4" />,
            shortcut: "⌘←",
            keywords: ["go", "back", "home", "exit", "rooms"],
            action: () => { router.push("/rooms"); onClose(); },
        },

        // ── Panels ───────────────────────────────────────────────────────
        {
            id: "toggle-chat",
            group: "Panels",
            label: hiddenPanels.has("chat") ? "Show Chat Panel" : "Hide Chat Panel",
            icon: <MessageSquare className="w-4 h-4" />,
            keywords: ["chat", "messages", "panel", "show", "hide"],
            action: () => { onTogglePanel("chat"); onClose(); },
        },
        {
            id: "toggle-members",
            group: "Panels",
            label: hiddenPanels.has("members") ? "Show Members Panel" : "Hide Members Panel",
            icon: <Users className="w-4 h-4" />,
            keywords: ["members", "people", "panel", "show", "hide"],
            action: () => { onTogglePanel("members"); onClose(); },
        },
        {
            id: "focus-mode",
            group: "Panels",
            label: focusMode ? "Exit Focus Mode" : "Enter Focus Mode",
            description: focusMode ? "Restore chat and member panels" : "Code-only view — hides chat and members",
            icon: focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />,
            shortcut: "⌘\\",
            keywords: ["focus", "zen", "fullscreen", "maximize", "distraction"],
            action: () => { onToggleFocus(); onClose(); },
        },

        // ── Room ─────────────────────────────────────────────────────────
        {
            id: "copy-invite",
            group: "Room",
            label: "Copy Invite Link",
            icon: <UserPlus className="w-4 h-4" />,
            keywords: ["invite", "share", "link", "copy"],
            action: async () => {
                const link = room?.inviteToken
                    ? `${window.location.origin}/rooms/join/${room.inviteToken}`
                    : window.location.href;
                await navigator.clipboard.writeText(link);
                toast.success("Invite link copied");
                onClose();
            },
        },
        {
            id: "copy-room-id",
            group: "Room",
            label: "Copy Room ID",
            icon: <Copy className="w-4 h-4" />,
            keywords: ["id", "copy", "room"],
            action: async () => {
                await navigator.clipboard.writeText(roomId);
                toast.success("Room ID copied");
                onClose();
            },
        },

        // ── Code session (host) ───────────────────────────────────────────
        ...(isHost ? [
            {
                id: "slow-off",
                group: "Moderation",
                label: "Slow Mode: Off",
                description: room?.slowMode === "off" ? "Currently active" : undefined,
                icon: <Timer className="w-4 h-4" />,
                keywords: ["slow", "mode", "rate", "limit"],
                action: () => setSlowMode("off"),
            },
            {
                id: "slow-5s",
                group: "Moderation",
                label: "Slow Mode: 5 seconds",
                description: room?.slowMode === "5s" ? "Currently active" : undefined,
                icon: <Timer className="w-4 h-4" />,
                keywords: ["slow", "5", "five"],
                action: () => setSlowMode("5s"),
            },
            {
                id: "slow-30s",
                group: "Moderation",
                label: "Slow Mode: 30 seconds",
                description: room?.slowMode === "30s" ? "Currently active" : undefined,
                icon: <Timer className="w-4 h-4" />,
                keywords: ["slow", "30", "thirty"],
                action: () => setSlowMode("30s"),
            },
            {
                id: "slow-60s",
                group: "Moderation",
                label: "Slow Mode: 60 seconds",
                description: room?.slowMode === "60s" ? "Currently active" : undefined,
                icon: <Timer className="w-4 h-4" />,
                keywords: ["slow", "60", "sixty", "minute"],
                action: () => setSlowMode("60s"),
            },
        ] as CommandItem[] : []),

        // ── Session ──────────────────────────────────────────────────────
        {
            id: "leave",
            group: "Session",
            label: "Leave Room",
            icon: <LogOut className="w-4 h-4" />,
            keywords: ["leave", "exit", "quit", "disconnect"],
            action: async () => {
                try {
                    await apiFetch(`/api/rooms/${roomId}/leave`, { method: "POST" });
                } catch {}
                router.push("/rooms");
                onClose();
            },
        },
    ];

    async function setSlowMode(mode: SlowMode) {
        try {
            await apiFetch(`/api/rooms/${roomId}/moderate`, {
                method: "PATCH",
                body: JSON.stringify({ action: "slow_mode", slowMode: mode }),
            });
            toast.success(`Slow mode set to ${mode === "off" ? "off" : mode}`);
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to set slow mode");
        }
        onClose();
    }

    // Filter
    const q = query.trim().toLowerCase();
    const filtered = q
        ? COMMANDS.filter(
            (c) =>
                c.label.toLowerCase().includes(q) ||
                c.keywords.some((k) => k.includes(q)) ||
                c.description?.toLowerCase().includes(q)
          )
        : COMMANDS;

    // Group
    const groups = Array.from(new Set(filtered.map((c) => c.group)));

    // Keyboard navigation
    useEffect(() => {
        setCursor(0);
    }, [query]);

    function onKeyDown(e: React.KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, filtered.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            filtered[cursor]?.action();
        } else if (e.key === "Escape") {
            onClose();
        }
    }

    // Scroll active item into view
    useEffect(() => {
        const el = listRef.current?.querySelector(`[data-index="${cursor}"]`);
        el?.scrollIntoView({ block: "nearest" });
    }, [cursor]);

    let globalIdx = -1;

    return (
        /* Backdrop */
        <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Blur backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Panel */}
            <div className="relative w-full max-w-[560px] mx-4 rounded-2xl border border-white/5 bg-[#111111] shadow-2xl shadow-black/60 overflow-hidden">

                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5">
                    <Command className="w-4 h-4 text-tx-muted shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Type a command or search…"
                        className="flex-1 bg-transparent text-sm text-tx placeholder:text-tx-disabled focus:outline-none"
                    />
                    <kbd className="text-[10px] text-zinc-700 border border-white/5 rounded px-1.5 py-0.5">ESC</kbd>
                </div>

                {/* Results */}
                <ul
                    ref={listRef}
                    className="max-h-[360px] overflow-y-auto py-1"
                    style={{ scrollbarWidth: "none" }}
                >
                    {filtered.length === 0 ? (
                        <li className="px-4 py-8 text-center text-sm text-tx-disabled">
                            No commands match "{query}"
                        </li>
                    ) : (
                        groups.map((group) => {
                            const items = filtered.filter((c) => c.group === group);
                            return (
                                <li key={group}>
                                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-tx-disabled">
                                        {group}
                                    </div>
                                    <ul>
                                        {items.map((cmd) => {
                                            globalIdx++;
                                            const idx = globalIdx;
                                            const isActive = cursor === idx;

                                            return (
                                                <li key={cmd.id} data-index={idx}>
                                                    <button
                                                        onMouseEnter={() => setCursor(idx)}
                                                        onClick={cmd.action}
                                                        className={cn(
                                                            "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                                                            isActive
                                                                ? "bg-zinc-800/60"
                                                                : "hover:bg-surface-hover"
                                                        )}
                                                    >
                                                        <span className={cn(
                                                            "shrink-0",
                                                            isActive ? "text-brand" : "text-tx-muted"
                                                        )}>
                                                            {cmd.icon}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <p className={cn(
                                                                "text-[13px] font-medium",
                                                                isActive ? "text-tx" : "text-tx-secondary"
                                                            )}>
                                                                {cmd.label}
                                                            </p>
                                                            {cmd.description && (
                                                                <p className="text-[11px] text-tx-disabled mt-0.5">
                                                                    {cmd.description}
                                                                </p>
                                                            )}
                                                        </div>
                                                        {cmd.shortcut && (
                                                            <kbd className="text-[10px] text-tx-disabled border border-white/5 rounded px-1.5 py-0.5 shrink-0">
                                                                {cmd.shortcut}
                                                            </kbd>
                                                        )}
                                                        {isActive && (
                                                            <ChevronRight className="w-3.5 h-3.5 text-tx-disabled shrink-0" />
                                                        )}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </li>
                            );
                        })
                    )}
                </ul>

                {/* Footer */}
                <div className="flex items-center justify-between px-4 py-2 border-t border-b bg-panel/20">
                    <div className="flex items-center gap-3 text-[10px] text-zinc-700">
                        <span className="flex items-center gap-1">
                            <kbd className="border border-white/5 rounded px-1 py-0.5">↑↓</kbd> navigate
                        </span>
                        <span className="flex items-center gap-1">
                            <kbd className="border border-white/5 rounded px-1 py-0.5">↵</kbd> select
                        </span>
                    </div>
                    <span className="text-[10px] text-zinc-700">{filtered.length} commands</span>
                </div>
            </div>
        </div>
    );
}
