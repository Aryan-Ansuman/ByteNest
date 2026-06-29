"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";
import { Search, Wand2, Settings, Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import type { CodeSession, SessionFile } from "@/types/rooms";
import { useRoomStore } from "@/store/roomStore";
import { useCodeSession } from "@/hooks/useCodeSession";
import { uint8ToBase64 } from "@/lib/yjs/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import FileTabBar from "./FileTabBar";
import { ViewOnlyToggle } from "./ViewOnlyToggle";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
    roomId: string;
    session: CodeSession;
}

export default function CodePanelInner({ roomId, session }: Props) {
    const currentMember = useRoomStore((s) => s.currentMember);
    const room = useRoomStore((s) => s.room);
    // Always read live session from store (file list + viewOnly update via Realtime)
    const liveSession = useRoomStore((s) => s.codeSession) ?? session;

    const { ydoc, awareness } = useCodeSession(roomId, session);

    const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(
        null
    );
    const monacoRef = useRef<Monaco | null>(null);
    const bindingRef = useRef<MonacoBinding | null>(null);
    // Use ref for files to avoid stale closure in createBinding
    const filesRef = useRef<SessionFile[]>([]);

    const [activeFile, setActiveFile] = useState(session.activeFile);
    const [isEditorReady, setIsEditorReady] = useState(false);
    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
    const [showSettings, setShowSettings] = useState(false);
    const [editorOpts, setEditorOpts] = useState({ fontSize: 13, tabSize: 4, wordWrap: "off" as "off" | "on" });
    const settingsRef = useRef<HTMLDivElement>(null);

    const parsedFiles: SessionFile[] = (() => {
        try {
            return JSON.parse(liveSession.files ?? "[]");
        } catch {
            return [];
        }
    })();

    // Keep ref in sync on every render
    filesRef.current = parsedFiles;

    const isHost = currentMember?.userId === room?.hostId;
    const isViewOnly = liveSession.viewOnly && !isHost;

    // ── Create / replace MonacoBinding ─────────────────────────────
    const createBinding = useCallback(
        (filename: string) => {
            if (!ydoc || !editorRef.current || !monacoRef.current || !awareness)
                return;

            // Destroy existing binding before creating new one
            if (bindingRef.current) {
                bindingRef.current.destroy();
                bindingRef.current = null;
            }

            const ytext = ydoc.getText(filename);
            const editor = editorRef.current;
            const monaco = monacoRef.current;

            // Switch Monaco language to match file
            const file = filesRef.current.find((f) => f.name === filename);
            const lang = file?.language ?? "javascript";
            const model = editor.getModel();
            if (model) monaco.editor.setModelLanguage(model, lang);

            // MonacoBinding syncs editor ↔ Y.Text + renders remote cursors
            bindingRef.current = new MonacoBinding(
                ytext,
                editor.getModel()!,
                new Set([editor]),
                awareness
            );
        },
        [ydoc, awareness]
        // parsedFiles intentionally excluded — accessed via filesRef.current
    );

    // Close settings popover on outside click
    useEffect(() => {
        function handler(e: MouseEvent) {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setShowSettings(false);
            }
        }
        if (showSettings) document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showSettings]);

    // When ydoc initialises (after snapshot hydration) + editor ready → bind
    useEffect(() => {
        if (ydoc && isEditorReady) createBinding(activeFile);

        return () => {
            if (bindingRef.current) {
                bindingRef.current.destroy();
                bindingRef.current = null;
            }
        };
    }, [ydoc, isEditorReady, createBinding, activeFile]);

    // Sync active file when host switches — all clients follow
    useEffect(() => {
        if (
            liveSession.activeFile &&
            liveSession.activeFile !== activeFile &&
            ydoc &&
            isEditorReady
        ) {
            setActiveFile(liveSession.activeFile);
            createBinding(liveSession.activeFile);
        }
    }, [liveSession.activeFile, activeFile, ydoc, isEditorReady, createBinding]);

    // Apply read-only dynamically when viewOnly changes
    useEffect(() => {
        editorRef.current?.updateOptions({ readOnly: isViewOnly });
    }, [isViewOnly]);

    // ── Editor mount ───────────────────────────────────────────────
    function handleEditorDidMount(
        editor: MonacoType.editor.IStandaloneCodeEditor,
        monaco: Monaco
    ) {
        editorRef.current = editor;
        monacoRef.current = monaco;

        monaco.editor.defineTheme("bytenest-dark", {
            base: "vs-dark",
            inherit: true,
            rules: [],
            colors: {
                "editor.background": "#1A1A20",
                "editorCursor.foreground": "#a7c8b3",
                "editor.selectionBackground": "#a7c8b333",
                "editor.lineHighlightBackground": "#1A1A20",
                "editor.lineHighlightBorder": "#a7c8b31a",
                "editorIndentGuide.background": "#ffffff0d",
                "editorIndentGuide.activeBackground": "#ffffff26",
                "editorWidget.background": "#17171B",
                "editorWidget.border": "#ffffff1a",
                "editorWidget.resizeBorder": "#a7c8b3",
                "editorHoverWidget.background": "#17171B",
                "editorHoverWidget.border": "#ffffff1a",
                "editorHoverWidget.foreground": "#e4e4e7",
                "editorFindMatch.background": "#a7c8b366",
                "editorFindMatchHighlight.background": "#a7c8b326",
                "input.background": "#09090b",
                "input.border": "#ffffff1a",
                "input.foreground": "#e4e4e7",
                "inputOption.activeBackground": "#a7c8b333",
                "inputOption.activeBorder": "#a7c8b3",
                "inputOption.activeForeground": "#a7c8b3",
            }
        });
        monaco.editor.setTheme("bytenest-dark");

        editor.onDidChangeCursorPosition((e) => {
            setCursorPos({ line: e.position.lineNumber, col: e.position.column });
        });

        setIsEditorReady(true);
    }

    // ── File switch (local + broadcast) ───────────────────────────
    function handleSwitchFile(filename: string) {
        setActiveFile(filename);
        createBinding(filename);
        apiFetch(`/api/rooms/${roomId}/session/${session.$id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: "switch_file", filename }),
        }).catch(() => {});
    }

    // ── Add file ───────────────────────────────────────────────────
    async function handleAddFile(name: string, language: string) {
        try {
            await apiFetch(`/api/rooms/${roomId}/session/${session.$id}`, {
                method: "PATCH",
                body: JSON.stringify({ action: "add_file", name, language }),
            });
        } catch (error: any) {
            toast.error(error?.message ?? "Failed to add file");
        }
    }

    // ── End session ────────────────────────────────────────────────
    const [ending, setEnding] = useState(false);
    
    async function handleEndSession() {
        setEnding(true);
        let yjsSnapshotB64: string | undefined = undefined;
        if (ydoc) {
            const state = Y.encodeStateAsUpdate(ydoc);
            yjsSnapshotB64 = uint8ToBase64(state);
        }
        
        try {
            await apiFetch(`/api/rooms/${roomId}/session/${session.$id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    action: "end",
                    ...(yjsSnapshotB64 ? { yjsSnapshotB64 } : {})
                }),
            });
            toast.success("Code session ended");
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to end session");
        } finally {
            setEnding(false);
        }
    }

    const currentLang =
        parsedFiles.find((f) => f.name === activeFile)?.language ?? "javascript";

    return (
        <div className="flex flex-col h-full bg-[#09090b]">
            {/* File tab bar */}
            <FileTabBar
                files={parsedFiles}
                activeFile={activeFile}
                isHost={isHost}
                roomId={roomId}
                sessionId={session.$id}
                onSwitch={handleSwitchFile}
                onAddFile={handleAddFile}
                onEndSession={handleEndSession}
                ending={ending}
            />

            <div className="flex-1 flex flex-col min-h-0 bg-[#1A1A20] rounded-t-[8px] overflow-hidden border border-white/[0.04]">
                {/* Editor Toolbar */}
                <div className="flex items-center gap-3 px-4 h-[44px] bg-[#17171B] border-b border-white/[0.04] shrink-0">
                    <ViewOnlyToggle
                        roomId={roomId}
                        sessionId={session.$id}
                        isHost={isHost}
                        viewOnly={liveSession.viewOnly}
                    />
                    
                    {/* Auto Save indicator */}
                    <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.02] border border-white/[0.03]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#a7c8b3]/70 animate-pulse" />
                        <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Auto Save</span>
                    </div>

                    <div className="flex-1" />

                    {/* Mini Actions */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => editorRef.current?.getAction("actions.find")?.run()}
                            className="p-1.5 rounded hover:bg-white/[0.04] text-zinc-400 hover:text-zinc-200 transition-colors"
                            title="Search (⌘F)"
                        >
                            <Search className="w-[14px] h-[14px]" />
                        </button>
                        <button
                            onClick={() => editorRef.current?.getAction("editor.action.formatDocument")?.run()}
                            className="p-1.5 rounded hover:bg-white/[0.04] text-zinc-400 hover:text-zinc-200 transition-colors"
                            title="Format (⇧⌥F)"
                        >
                            <Wand2 className="w-[14px] h-[14px]" />
                        </button>
                        <div className="relative" ref={settingsRef}>
                            <button
                                onClick={() => setShowSettings((v) => !v)}
                                className={cn(
                                    "p-1.5 rounded hover:bg-white/[0.04] text-zinc-400 hover:text-zinc-200 transition-colors",
                                    showSettings && "bg-white/[0.04] text-zinc-200"
                                )}
                                title="Editor Settings"
                            >
                                <Settings className="w-[14px] h-[14px]" />
                            </button>

                            <AnimatePresence>
                                {showSettings && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                        transition={{ duration: 0.12, ease: "easeOut" }}
                                        className="absolute right-0 top-9 z-50 w-[200px] rounded-xl border border-white/5 bg-[#0e0e0e] shadow-2xl p-3 space-y-3"
                                    >
                                        <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Editor Settings</p>

                                        {/* Font Size */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-zinc-400">Font Size</span>
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => {
                                                        const next = Math.max(10, editorOpts.fontSize - 1);
                                                        setEditorOpts((o) => ({ ...o, fontSize: next }));
                                                        editorRef.current?.updateOptions({ fontSize: next });
                                                    }}
                                                    className="w-5 h-5 flex items-center justify-center rounded bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                                                >
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <span className="text-[11px] text-zinc-200 w-5 text-center tabular-nums">{editorOpts.fontSize}</span>
                                                <button
                                                    onClick={() => {
                                                        const next = Math.min(24, editorOpts.fontSize + 1);
                                                        setEditorOpts((o) => ({ ...o, fontSize: next }));
                                                        editorRef.current?.updateOptions({ fontSize: next });
                                                    }}
                                                    className="w-5 h-5 flex items-center justify-center rounded bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Tab Size */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-zinc-400">Tab Size</span>
                                            <div className="flex items-center gap-1">
                                                {[2, 4, 8].map((size) => (
                                                    <button
                                                        key={size}
                                                        onClick={() => {
                                                            setEditorOpts((o) => ({ ...o, tabSize: size }));
                                                            editorRef.current?.updateOptions({ tabSize: size });
                                                        }}
                                                        className={cn(
                                                            "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                                                            editorOpts.tabSize === size
                                                                ? "bg-[#a7c8b3]/20 text-[#a7c8b3]"
                                                                : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
                                                        )}
                                                    >
                                                        {size}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Word Wrap */}
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-zinc-400">Word Wrap</span>
                                            <button
                                                onClick={() => {
                                                    const next = editorOpts.wordWrap === "off" ? "on" : "off";
                                                    setEditorOpts((o) => ({ ...o, wordWrap: next as "off" | "on" }));
                                                    editorRef.current?.updateOptions({ wordWrap: next });
                                                }}
                                                className={cn(
                                                    "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                                                    editorOpts.wordWrap === "on"
                                                        ? "bg-[#a7c8b3]/20 text-[#a7c8b3]"
                                                        : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
                                                )}
                                            >
                                                {editorOpts.wordWrap === "on" ? "On" : "Off"}
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>

                {/* Monaco */}
                <div className="flex-1 relative">
                    <Editor
                    height="100%"
                    language={currentLang}
                    theme="bytenest-dark"
                    onMount={handleEditorDidMount}
                    options={{
                        readOnly: isViewOnly,
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        padding: { top: 40 },
                        lineNumbers: "on",
                        renderLineHighlight: "line",
                        cursorBlinking: "smooth",
                        smoothScrolling: true,
                        tabSize: 4,
                    }}
                    loading={
                        <div className="flex h-full items-center justify-center text-zinc-600 text-sm">
                            Loading editor…
                        </div>
                    }
                />
                </div>

                {/* Status Bar */}
                <div className="flex items-center justify-between px-4 h-[28px] bg-[#17171B] border-t border-white/[0.04] shrink-0 text-[11px] text-zinc-500 font-medium tracking-wide">
                    <div className="flex items-center gap-4">
                        <span className="capitalize">{currentLang}</span>
                        <span>UTF-8</span>
                        <span>Spaces: 4</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
                        <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80" />
                            <span>Live</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
