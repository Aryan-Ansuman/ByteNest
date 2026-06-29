"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRoomInitializer } from "@/hooks/useRoomInitializer";
import { useRoomRealtime } from "@/hooks/useRoomRealtime";
import { useRoomStore } from "@/store/roomStore";
import LeftNav from "@/components/rooms/LeftNav";
import ChatPanel from "@/components/rooms/ChatPanel";
import CodePanel from "@/components/rooms/CodePanel";
import MemberSidebar from "@/components/rooms/MemberSidebar";
import TopBar from "@/components/rooms/TopBar";
import RoomError from "@/components/rooms/RoomError";
import RoomSkeleton from "@/components/rooms/RoomSkeleton";
import CommandPalette from "@/components/rooms/CommandPalette";
import RoomInfoPanel from "@/components/rooms/RoomInfoPanel";
import { cn } from "@/lib/utils";

interface Props {
    roomId: string;
    inviteToken?: string;
}

/** Persistent panel visibility — survives tab switches */
type PanelId = "chat" | "code" | "members" | "info";

export default function RoomClient({ roomId, inviteToken }: Props) {
    useRoomInitializer(roomId, inviteToken);
    useRoomRealtime(roomId);

    const room           = useRoomStore((s) => s.room);
    const isInitialized  = useRoomStore((s) => s.isInitialized);
    const isInitializing = useRoomStore((s) => s.isInitializing);
    const initError      = useRoomStore((s) => s.initError);
    const codeSession    = useRoomStore((s) => s.codeSession);

    // ── Panel state ───────────────────────────────────────────────────────
    const [hiddenPanels, setHiddenPanels]     = useState<Set<PanelId>>(new Set());
    const [chatWidth, setChatWidth]           = useState(280);
    const [membersWidth, setMembersWidth]     = useState(240);
    const [filesWidth, setFilesWidth]         = useState(200);
    const [commandOpen, setCommandOpen]       = useState(false);
    const [showInfo, setShowInfo]             = useState(false);
    const [focusMode, setFocusMode]           = useState(false);

    // Drag-resize refs
    const draggingRef     = useRef<"chat" | "members" | "files" | null>(null);
    const dragStartX      = useRef(0);
    const dragStartWidth  = useRef(0);

    const hasCodeSession = Boolean(codeSession);

    // ── Keyboard shortcuts ────────────────────────────────────────────────
    useEffect(() => {
        if (window.innerWidth < 768) {
            setHiddenPanels(new Set(["code", "members", "info"]));
        }

        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement;
            const isInput =
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target.isContentEditable;
            
            const isPaletteInput = target.closest('[cmdk-root]') !== null;
            // Cmd/Ctrl + K → command palette
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                setCommandOpen((v) => !v);
            }
            // Cmd + \ → focus mode
            if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
                e.preventDefault();
                setFocusMode((v) => !v);
            }
            // Escape closes palette
            if (e.key === "Escape") {
                if (!isInput || isPaletteInput) {
                    setCommandOpen(false);
                    setShowInfo(false);
                }
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // ── Drag-resize logic ─────────────────────────────────────────────────
    const startDrag = useCallback(
        (panel: "chat" | "members" | "files", e: React.MouseEvent) => {
            e.preventDefault();
            draggingRef.current = panel;
            dragStartX.current = e.clientX;
            dragStartWidth.current = panel === "chat" ? chatWidth : panel === "members" ? membersWidth : filesWidth;

            function onMove(ev: MouseEvent) {
                if (!draggingRef.current) return;
                const delta = ev.clientX - dragStartX.current;
                if (draggingRef.current === "chat") {
                    setChatWidth(Math.max(260, Math.min(500, dragStartWidth.current + delta)));
                } else if (draggingRef.current === "files") {
                    setFilesWidth(Math.max(160, Math.min(300, dragStartWidth.current + delta)));
                } else {
                    setMembersWidth(Math.max(200, Math.min(300, dragStartWidth.current - delta)));
                }
            }
            function onUp() {
                draggingRef.current = null;
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
            }
            window.addEventListener("mousemove", onMove);
            window.addEventListener("mouseup", onUp);
        },
        [chatWidth, membersWidth]
    );

    function togglePanel(id: PanelId) {
        setHiddenPanels((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    // ── Render guards ─────────────────────────────────────────────────────
    if (initError)                        return <RoomError message={initError} />;
    if (isInitializing || !isInitialized) return <RoomSkeleton />;
    if (!room)                            return null;

    const chatVisible    = !hiddenPanels.has("chat")    && !focusMode;
    const membersVisible = !hiddenPanels.has("members") && !focusMode;
    const codeVisible    = !hiddenPanels.has("code")    && !focusMode;

    return (
        <div className="flex flex-col h-screen bg-[#09090b] text-zinc-100 overflow-hidden select-none">

            {/* ── Top bar ──────────────────────────────────────────────── */}
            <TopBar
                room={room}
                roomId={roomId}
                hiddenPanels={hiddenPanels}
                onTogglePanel={togglePanel}
                onOpenCommand={() => setCommandOpen(true)}
                onToggleInfo={() => setShowInfo((v) => !v)}
                focusMode={focusMode}
                onToggleFocus={() => setFocusMode((v) => !v)}
            />

            {/* ── Body ─────────────────────────────────────────────────── */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

                {/* Chat panel — resizable */}
                {chatVisible && (
                    <>
                        <div
                            className={cn(
                                "flex flex-col overflow-hidden bg-[#111113]",
                                (codeVisible || membersVisible) ? "border-b md:border-b-0 md:border-r border-white/5 flex-1 md:flex-none w-full md:w-[var(--chat-width)] md:shrink-0 min-h-[300px]" : "flex-1 w-full"
                            )}
                            style={(codeVisible || membersVisible) ? { '--chat-width': `${chatWidth}px` } as any : {}}
                        >
                            <ChatPanel roomId={roomId} />
                        </div>
                        {/* Drag handle / Gutter */}
                        {(codeVisible || membersVisible) && (
                            <div
                                className="hidden md:flex w-2 shrink-0 cursor-col-resize group items-center justify-center relative hover:bg-white/[0.02] transition-colors z-10 bg-[#09090b]"
                                onMouseDown={(e) => startDrag("chat", e)}
                            >
                                <div className="absolute inset-y-0 -left-1 -right-1" />
                                <div className="h-8 w-1 rounded-full bg-zinc-800/60 group-hover:bg-brand/50 transition-colors" />
                            </div>
                        )}
                    </>
                )}

                {/* Files Sidebar (Adjacent to CodePanel) */}
                {!focusMode && hasCodeSession && (
                    <>
                        <div 
                            style={{ '--files-width': `${filesWidth}px` } as any} 
                            className="w-full md:w-[var(--files-width)] md:shrink-0 flex flex-col overflow-hidden bg-[#111113] border-b md:border-b-0 md:border-r border-white/5 min-h-[250px]"
                        >
                            <LeftNav roomId={roomId} />
                        </div>
                        {/* Drag handle / Gutter */}
                        <div
                            className="hidden md:flex w-2 shrink-0 cursor-col-resize group items-center justify-center relative hover:bg-white/[0.02] transition-colors z-10 bg-[#09090b]"
                            onMouseDown={(e) => startDrag("files", e)}
                        >
                            <div className="absolute inset-y-0 -left-1 -right-1" />
                            <div className="h-8 w-1 rounded-full bg-zinc-800/60 group-hover:bg-brand/50 transition-colors" />
                        </div>
                    </>
                )}

                {/* Code / info panel — fills remaining */}
                {codeVisible && (
                    <div className="flex-1 overflow-hidden min-w-0 relative w-full min-h-[400px]">
                        {showInfo ? (
                            <RoomInfoPanel room={room} onClose={() => setShowInfo(false)} />
                        ) : (
                            <CodePanel roomId={roomId} session={codeSession} />
                        )}
                    </div>
                )}

                {/* Members drag handle + sidebar */}
                {membersVisible && (
                    <>
                        {/* Drag handle / Gutter */}
                        <div
                            className="hidden md:flex w-2 shrink-0 cursor-col-resize group items-center justify-center relative hover:bg-white/[0.02] transition-colors z-10 bg-[#09090b]"
                            onMouseDown={(e) => startDrag("members", e)}
                        >
                            <div className="absolute inset-y-0 -left-1 -right-1" />
                            <div className="h-8 w-1 rounded-full bg-zinc-800/60 group-hover:bg-brand/50 transition-colors" />
                        </div>
                        <aside
                            className="w-full md:w-[var(--members-width)] md:shrink-0 overflow-hidden bg-[#111113] border-t md:border-t-0 md:border-l border-white/5 flex flex-col min-h-[300px]"
                            style={{ '--members-width': `${membersWidth}px` } as any}
                            aria-label="Room members"
                        >
                            <MemberSidebar roomId={roomId} />
                        </aside>
                    </>
                )}
            </div>

            {/* ── Command palette ───────────────────────────────────────── */}
            {commandOpen && (
                <CommandPalette
                    roomId={roomId}
                    onClose={() => setCommandOpen(false)}
                    onTogglePanel={togglePanel}
                    hiddenPanels={hiddenPanels}
                    onToggleFocus={() => setFocusMode((v) => !v)}
                    focusMode={focusMode}
                />
            )}
        </div>
    );
}
