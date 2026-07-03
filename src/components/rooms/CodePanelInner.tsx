"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";
import { Search, Wand2, Settings, Minus, Plus, MessageSquare, GitCompare } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import type { CodeSession, SessionFile } from "@/types/rooms";
import { useRoomStore } from "@/store/roomStore";
import { useCodeSession } from "@/hooks/useCodeSession";
import { usePresenceMap } from "@/hooks/usePresenceMap";
import { useCodeComments, type PositionedComment } from "@/hooks/useCodeComments";
import { uint8ToBase64 } from "@/lib/yjs/utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import FileTabBar from "./FileTabBar";
import RunOutputPanel, { type RunResult } from "./RunOutputPanel";
import { ViewOnlyToggle } from "./ViewOnlyToggle";
import { NewCommentPopover } from "./NewCommentPopover";
import { CommentThreadPopover } from "./CommentThreadPopover";
import { DiffViewModal } from "./DiffViewModal";
import { PresenceMap } from "./PresenceMap";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
    roomId: string;
    session: CodeSession;
}

export default function CodePanelInner({ roomId, session }: Props) {
    const currentMember = useRoomStore((s) => s.currentMember);
    const room = useRoomStore((s) => s.room);
    const liveSession = useRoomStore((s) => s.codeSession) ?? session;

    const { ydoc, awareness } = useCodeSession(roomId, session, session.activeFile);
    const presence = usePresenceMap(awareness);
    const { getCommentsForFile, addComment, resolveComment, deleteComment } =
        useCodeComments(roomId, session.$id, ydoc);
    const getCommentsForFileRef = useRef(getCommentsForFile);
    getCommentsForFileRef.current = getCommentsForFile;

    const editorRef = useRef<MonacoType.editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const bindingRef = useRef<MonacoBinding | null>(null);
    const filesRef = useRef<SessionFile[]>([]);
    const decorationIdsRef = useRef<string[]>([]);
    // Separate decoration collection for remote cursor name labels — kept
    // independent from MonacoBinding's own selection-highlight decorations
    // so re-binding on file switch doesn't clobber it.
    const cursorLabelDecorationsRef = useRef<string[]>([]);
    const activeYTextRef = useRef<Y.Text | null>(null);
    const injectedStyleRef = useRef<HTMLStyleElement | null>(null);

    const [activeFile, setActiveFile] = useState(session.activeFile);
    const activeFileRef = useRef(activeFile);
    activeFileRef.current = activeFile;
    const [isEditorReady, setIsEditorReady] = useState(false);
    const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
    const [showSettings, setShowSettings] = useState(false);
    const [editorOpts, setEditorOpts] = useState({ fontSize: 13, tabSize: 4, wordWrap: "off" as "off" | "on" });
    const settingsRef = useRef<HTMLDivElement>(null);

    // ── Comment popovers ────────────────────────────────────────────────────
    const [composeAt, setComposeAt] = useState<{ line: number; offset: number; top: number } | null>(null);
    const [openThread, setOpenThread] = useState<{ comments: PositionedComment[]; top: number } | null>(null);

    // ── Diff view ────────────────────────────────────────────────────────────
    const [showDiffView, setShowDiffView] = useState(false);

    // ── Run output state ────────────────────────────────────────
    const [runResult, setRunResult] = useState<RunResult | null>(null);
    const [running, setRunning] = useState(false);
    const [showOutput, setShowOutput] = useState(false);

    const parsedFiles: SessionFile[] = (() => {
        try { return JSON.parse(liveSession.files ?? "[]"); }
        catch { return []; }
    })();

    filesRef.current = parsedFiles;

    const isHost = currentMember?.userId === room?.hostId;
    const isViewOnly = liveSession.viewOnly && !isHost;

    // ── Remote cursor name labels ─────────────────────────────────────────
    // MonacoBinding (y-monaco) already renders selection-range decorations
    // for remote peers via `yRemoteSelection-{clientID}` classes, but ships
    // no name label and no per-user color. This renders a second, independent
    // decoration layer that reads the same awareness payload and adds:
    //   1. A floating name badge at each peer's cursor head position
    //   2. A colored caret line at that position
    // via `afterContentClassName`, plus dynamically injected per-client CSS
    // (color is data-driven per user, so it can't be a static stylesheet rule).
    const renderCursorLabels = useCallback(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const ytext = activeYTextRef.current;
        if (!editor || !monaco || !awareness || !ydoc || !ytext) return;

        const model = editor.getModel();
        if (!model) return;

        const newDecorations: MonacoType.editor.IModelDeltaDecoration[] = [];
        const styleRules: string[] = [];

        awareness.getStates().forEach((state: any, clientID: number) => {
            if (clientID === ydoc.clientID) return; // skip self
            const selection = state?.selection;
            const user = state?.user;
            if (!selection?.head || !user?.name) return;

            // Resolve the relative position against the *currently active*
            // Y.Text. If the peer is editing a different file, their relative
            // position won't resolve against this ytext and we correctly skip them.
            const headAbs = Y.createAbsolutePositionFromRelativePosition(selection.head, ydoc);
            if (!headAbs || headAbs.type !== ytext) return;

            const pos = model.getPositionAt(headAbs.index);
            const color: string = user.color ?? "#6366f1";
            const safeName = String(user.name).slice(0, 24);
            const labelClass = `remote-cursor-label-${clientID}`;
            const caretClass = `remote-cursor-caret-${clientID}`;

            newDecorations.push({
                range: new monaco.Range(pos.lineNumber, pos.column, pos.lineNumber, pos.column),
                options: {
                    className: caretClass,
                    afterContentClassName: labelClass,
                    stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
                    zIndex: 50,
                },
            });

            // Per-client dynamic styling — caret line + floating name badge.
            // Escape the name for use inside a CSS content: "" string.
            const escapedName = safeName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
            styleRules.push(`
                .${caretClass} {
                    border-left: 2px solid ${color};
                    position: relative;
                }
                .${labelClass}::after {
                    content: "${escapedName}";
                    position: absolute;
                    top: -1.15em;
                    left: 0;
                    background: ${color};
                    color: #08100b;
                    font-size: 10px;
                    font-weight: 600;
                    font-family: ui-sans-serif, system-ui, sans-serif;
                    padding: 1px 5px;
                    border-radius: 4px 4px 4px 0;
                    white-space: nowrap;
                    pointer-events: none;
                    z-index: 50;
                    line-height: 1.4;
                }
            `);
        });

        // Inject/update a single <style> tag for all active remote cursors.
        if (!injectedStyleRef.current) {
            const styleEl = document.createElement("style");
            styleEl.setAttribute("data-remote-cursor-styles", "");
            document.head.appendChild(styleEl);
            injectedStyleRef.current = styleEl;
        }
        injectedStyleRef.current.textContent = styleRules.join("\n");

        cursorLabelDecorationsRef.current = editor.deltaDecorations(
            cursorLabelDecorationsRef.current,
            newDecorations
        );
    }, [awareness, ydoc]);

    const createBinding = useCallback(
        (filename: string) => {
            if (!ydoc || !editorRef.current || !monacoRef.current || !awareness) return;

            if (bindingRef.current) {
                bindingRef.current.destroy();
                bindingRef.current = null;
            }

            const ytext = ydoc.getText(filename);
            const editor = editorRef.current;
            const monaco = monacoRef.current;

            const file = filesRef.current.find((f) => f.name === filename);
            const lang = file?.language ?? "javascript";
            const model = editor.getModel();
            if (model) monaco.editor.setModelLanguage(model, lang);

            bindingRef.current = new MonacoBinding(
                ytext,
                editor.getModel()!,
                new Set([editor]),
                awareness
            );

            // Track the active Y.Text so the cursor-label renderer below knows
            // which file's relative positions are currently resolvable.
            activeYTextRef.current = ytext;
            renderCursorLabels();
        },
        [ydoc, awareness, renderCursorLabels]
    );

    useEffect(() => {
        function handler(e: MouseEvent) {
            if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
                setShowSettings(false);
            }
        }
        if (showSettings) document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showSettings]);

    useEffect(() => {
        if (ydoc && isEditorReady) createBinding(activeFile);
        return () => {
            if (bindingRef.current) { bindingRef.current.destroy(); bindingRef.current = null; }
        };
    }, [ydoc, isEditorReady, createBinding, activeFile]);

    useEffect(() => {
        if (liveSession.activeFile && liveSession.activeFile !== activeFile && ydoc && isEditorReady) {
            setActiveFile(liveSession.activeFile);
            createBinding(liveSession.activeFile);
        }
    }, [liveSession.activeFile, activeFile, ydoc, isEditorReady, createBinding]);

    // Broadcast presence: whenever the file open in *this* client changes —
    // whether the user clicked a different tab themselves or followed the
    // host's switch above — publish it on the shared awareness state so
    // every peer's presence map updates. Pure Yjs awareness; no API call.
    useEffect(() => {
        awareness?.setLocalStateField("user", {
            ...awareness.getLocalState()?.user,
            activeFile,
        });
    }, [awareness, activeFile]);

    useEffect(() => {
        editorRef.current?.updateOptions({ readOnly: isViewOnly });
    }, [isViewOnly]);

    // ── Comment gutter glyphs ────────────────────────────────────────────
    // Renders one glyph per root comment thread on the active file, at its
    // live-recalculated line number. Resolved threads render a muted check.
    useEffect(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco || !isEditorReady) return;

        const fileComments = getCommentsForFile(activeFile).filter((c) => !c.parentId);

        const newDecorations: MonacoType.editor.IModelDeltaDecoration[] = fileComments.map((c) => ({
            range: new monaco.Range(c.currentLine, 1, c.currentLine, 1),
            options: {
                glyphMarginClassName: c.resolvedAt
                    ? "bytenest-comment-glyph bytenest-comment-glyph-resolved"
                    : "bytenest-comment-glyph",
                glyphMarginHoverMessage: { value: c.resolvedAt ? "Resolved comment thread" : "Comment thread — click to view" },
            },
        }));

        decorationIdsRef.current = editor.deltaDecorations(
            decorationIdsRef.current,
            newDecorations
        );
    }, [activeFile, isEditorReady, getCommentsForFile]);

    // Close any open comment popovers when switching files
    useEffect(() => {
        setComposeAt(null);
        setOpenThread(null);
    }, [activeFile]);

    // Subscribe to awareness changes — re-renders remote cursor name labels
    // whenever any peer moves their cursor, joins, or leaves.
    useEffect(() => {
        if (!awareness || !isEditorReady) return;

        renderCursorLabels();
        awareness.on("change", renderCursorLabels);

        return () => {
            awareness.off("change", renderCursorLabels);
            // Clear any decorations this layer owns before unmounting/rebinding
            if (editorRef.current) {
                cursorLabelDecorationsRef.current = editorRef.current.deltaDecorations(
                    cursorLabelDecorationsRef.current,
                    []
                );
            }
        };
    }, [awareness, isEditorReady, renderCursorLabels]);

    // Remove the injected per-client style tag on unmount
    useEffect(() => {
        return () => {
            injectedStyleRef.current?.remove();
            injectedStyleRef.current = null;
        };
    }, []);

    // Cmd+Enter shortcut to run
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                handleRunCode();
            }
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeFile, parsedFiles]);

    function handleEditorDidMount(editor: MonacoType.editor.IStandaloneCodeEditor, monaco: Monaco) {
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

        // ── Add Comment — right-click context menu action ──────────────
        editor.addAction({
            id: "add-comment",
            label: "Add Comment",
            contextMenuGroupId: "navigation",
            contextMenuOrder: 1.5,
            run: (ed) => {
                const position = ed.getPosition();
                if (!position) return;
                const model = ed.getModel();
                if (!model) return;

                const offset = model.getOffsetAt(position);
                const top = ed.getTopForLineNumber(position.lineNumber) - ed.getScrollTop();

                setOpenThread(null);
                setComposeAt({ line: position.lineNumber, offset, top });
            },
        });

        // ── Gutter glyph click → open the thread anchored to that line ──
        editor.onMouseDown((e) => {
            if (
                e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
                !e.target.position
            ) {
                return;
            }
            const line = e.target.position.lineNumber;
            const file = activeFileRef.current;
            const fileComments = getCommentsForFileRef.current(file).filter(
                (c) => !c.parentId && c.currentLine === line
            );
            if (fileComments.length === 0) return;

            // Gather the full thread (root + replies) for whichever root sits on this line
            const allForFile = getCommentsForFileRef.current(file);
            const root = fileComments[0];
            const thread = [
                root,
                ...allForFile.filter((c) => c.parentId === root.$id),
            ].sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime());

            const top = editor.getTopForLineNumber(line) - editor.getScrollTop();
            setComposeAt(null);
            setOpenThread({ comments: thread, top });
        });

        setIsEditorReady(true);
    }

    function handleSwitchFile(filename: string) {
        setActiveFile(filename);
        createBinding(filename);
        apiFetch(`/api/rooms/${roomId}/session/${session.$id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: "switch_file", filename }),
        }).catch(() => {});
    }

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

    async function handleDeleteFile(name: string) {
        try {
            const res = await apiFetch<{ session: CodeSession }>(
                `/api/rooms/${roomId}/session/${session.$id}`,
                { method: "PATCH", body: JSON.stringify({ action: "delete_file", name }) }
            );
            // If the deleted file was active, switch to whatever the server set
            if (name === activeFile && res.session.activeFile) {
                setActiveFile(res.session.activeFile);
                createBinding(res.session.activeFile);
            }
        } catch (error: any) {
            toast.error(error?.message ?? "Failed to delete file");
        }
    }

    async function handleRunCode() {
        if (running) return;
        const file = parsedFiles.find((f) => f.name === activeFile);
        if (!file) return;

        // Get code from ydoc (authoritative) or fall back to editor value
        const code = ydoc
            ? ydoc.getText(activeFile).toString()
            : editorRef.current?.getValue() ?? "";

        setRunning(true);
        setShowOutput(true);

        try {
            const result = await apiFetch<RunResult>(
                `/api/rooms/${roomId}/session/run`,
                {
                    method: "POST",
                    body: JSON.stringify({ code, language: file.language, filename: file.name }),
                }
            );
            setRunResult(result);
        } catch (err: any) {
            setRunResult({
                stdout: "",
                stderr: err?.message ?? "Execution failed",
                exitCode: 1,
                language: file.language,
                durationMs: 0,
                runAt: new Date().toISOString(),
            });
        } finally {
            setRunning(false);
        }
    }

    const [ending, setEnding] = useState(false);

    async function handleEndSession() {
        setEnding(true);
        let yjsSnapshotB64: string | undefined;
        if (ydoc) {
            const state = Y.encodeStateAsUpdate(ydoc);
            yjsSnapshotB64 = uint8ToBase64(state);
        }
        try {
            await apiFetch(`/api/rooms/${roomId}/session/${session.$id}`, {
                method: "PATCH",
                body: JSON.stringify({ action: "end", ...(yjsSnapshotB64 ? { yjsSnapshotB64 } : {}) }),
            });
            toast.success("Code session ended");
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to end session");
        } finally {
            setEnding(false);
        }
    }

    const currentLang = parsedFiles.find((f) => f.name === activeFile)?.language ?? "javascript";
    const canRun = Boolean(RUNNABLE_LANGS[currentLang]);

    return (
        <div className="flex flex-col h-full bg-[#09090b]">
            <FileTabBar
                files={parsedFiles}
                activeFile={activeFile}
                isHost={isHost}
                roomId={roomId}
                sessionId={session.$id}
                onSwitch={handleSwitchFile}
                onAddFile={handleAddFile}
                onDeleteFile={isHost ? handleDeleteFile : undefined}
                onEndSession={handleEndSession}
                onRunCode={canRun ? handleRunCode : undefined}
                ending={ending}
            />

            {/* Editor + output split */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className={cn("flex flex-col min-h-0 bg-[#1A1A20] rounded-t-[8px] overflow-hidden border border-white/[0.04]", showOutput ? "flex-[0_0_60%]" : "flex-1")}>
                    {/* Editor Toolbar */}
                    <div className="flex items-center gap-3 px-4 h-[44px] bg-[#17171B] border-b border-white/[0.04] shrink-0">
                        <ViewOnlyToggle
                            roomId={roomId}
                            sessionId={session.$id}
                            isHost={isHost}
                            viewOnly={liveSession.viewOnly}
                        />
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/[0.02] border border-white/[0.03]">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#a7c8b3]/70 animate-pulse" />
                            <span className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Auto Save</span>
                        </div>

                        {/* Open comment threads on this file */}
                        {(() => {
                            const openCount = getCommentsForFile(activeFile).filter(
                                (c) => !c.parentId && !c.resolvedAt
                            ).length;
                            if (openCount === 0) return null;
                            return (
                                <div
                                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#a7c8b3]/10 border border-[#a7c8b3]/20"
                                    title="Open review comments on this file — right-click any line to add one"
                                >
                                    <MessageSquare className="w-3 h-3 text-[#a7c8b3]" />
                                    <span className="text-[10px] font-medium text-[#a7c8b3]">{openCount}</span>
                                </div>
                            );
                        })()}

                        <div className="flex-1" />

                        {/* Who's editing what */}
                        <PresenceMap presence={presence} myActiveFile={activeFile} />

                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setShowDiffView(true)}
                                className="p-1.5 rounded hover:bg-white/[0.04] text-zinc-400 hover:text-zinc-200 transition-colors"
                                title="Compare changes"
                            >
                                <GitCompare className="w-[14px] h-[14px]" />
                            </button>
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
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-zinc-400">Font Size</span>
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={() => { const n = Math.max(10, editorOpts.fontSize - 1); setEditorOpts((o) => ({ ...o, fontSize: n })); editorRef.current?.updateOptions({ fontSize: n }); }} className="w-5 h-5 flex items-center justify-center rounded bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"><Minus className="w-3 h-3" /></button>
                                                    <span className="text-[11px] text-zinc-200 w-5 text-center tabular-nums">{editorOpts.fontSize}</span>
                                                    <button onClick={() => { const n = Math.min(24, editorOpts.fontSize + 1); setEditorOpts((o) => ({ ...o, fontSize: n })); editorRef.current?.updateOptions({ fontSize: n }); }} className="w-5 h-5 flex items-center justify-center rounded bg-white/[0.04] text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors"><Plus className="w-3 h-3" /></button>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-zinc-400">Tab Size</span>
                                                <div className="flex items-center gap-1">
                                                    {[2, 4, 8].map((size) => (
                                                        <button key={size} onClick={() => { setEditorOpts((o) => ({ ...o, tabSize: size })); editorRef.current?.updateOptions({ tabSize: size }); }} className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition-colors", editorOpts.tabSize === size ? "bg-[#a7c8b3]/20 text-[#a7c8b3]" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300")}>{size}</button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] text-zinc-400">Word Wrap</span>
                                                <button onClick={() => { const n = editorOpts.wordWrap === "off" ? "on" : "off"; setEditorOpts((o) => ({ ...o, wordWrap: n as "off" | "on" })); editorRef.current?.updateOptions({ wordWrap: n }); }} className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition-colors", editorOpts.wordWrap === "on" ? "bg-[#a7c8b3]/20 text-[#a7c8b3]" : "bg-white/[0.04] text-zinc-500 hover:text-zinc-300")}>{editorOpts.wordWrap === "on" ? "On" : "Off"}</button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>

                    {/* Monaco */}
                    <div className="flex-1 relative">
                        {/* Gutter glyph styling — Monaco glyph margin classes must be global CSS */}
                        <style jsx global>{`
                            .bytenest-comment-glyph {
                                cursor: pointer;
                            }
                            .bytenest-comment-glyph::before {
                                content: "";
                                display: block;
                                width: 8px;
                                height: 8px;
                                margin: 6px 0 0 5px;
                                border-radius: 9999px;
                                background: #a7c8b3;
                                box-shadow: 0 0 6px rgba(167, 200, 179, 0.6);
                            }
                            .bytenest-comment-glyph-resolved::before {
                                background: #52525b;
                                box-shadow: none;
                            }
                        `}</style>

                        <Editor
                            height="100%"
                            language={currentLang}
                            theme="bytenest-dark"
                            onMount={handleEditorDidMount}
                            options={{
                                readOnly: isViewOnly,
                                fontSize: editorOpts.fontSize,
                                wordWrap: editorOpts.wordWrap,
                                tabSize: editorOpts.tabSize,
                                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                padding: { top: 40 },
                                lineNumbers: "on",
                                renderLineHighlight: "line",
                                cursorBlinking: "smooth",
                                smoothScrolling: true,
                                glyphMargin: true,
                            }}
                            loading={<div className="flex h-full items-center justify-center text-zinc-600 text-sm">Loading editor…</div>}
                        />

                        {/* New comment composer — anchored near the chosen line */}
                        {composeAt && (
                            <div
                                className="absolute left-12 z-30"
                                style={{ top: Math.max(8, composeAt.top) }}
                            >
                                <NewCommentPopover
                                    line={composeAt.line}
                                    onSubmit={async (body) => {
                                        await addComment(activeFile, composeAt.offset, composeAt.line, body);
                                    }}
                                    onClose={() => setComposeAt(null)}
                                />
                            </div>
                        )}

                        {/* Existing thread — opened by clicking a gutter glyph */}
                        {openThread && (
                            <div
                                className="absolute left-12 z-30"
                                style={{ top: Math.max(8, openThread.top) }}
                            >
                                <CommentThreadPopover
                                    thread={openThread.comments}
                                    currentUserId={currentMember?.userId ?? ""}
                                    isHost={isHost}
                                    onReply={async (body) => {
                                        const root = openThread.comments[0];
                                        await addComment(activeFile, root.anchorOffset, root.currentLine, body, root.$id);
                                    }}
                                    onResolve={async (resolved) => {
                                        await resolveComment(openThread.comments[0].$id, resolved);
                                        setOpenThread(null);
                                    }}
                                    onDelete={async (commentId) => {
                                        await deleteComment(commentId);
                                        // If we deleted the root and no replies remain, close the popover
                                        const remaining = openThread.comments.filter((c) => c.$id !== commentId);
                                        if (remaining.length === 0) setOpenThread(null);
                                        else setOpenThread({ ...openThread, comments: remaining });
                                    }}
                                    onClose={() => setOpenThread(null)}
                                />
                            </div>
                        )}
                    </div>

                    {/* Status Bar */}
                    <div className="flex items-center justify-between px-4 h-[28px] bg-[#17171B] border-t border-white/[0.04] shrink-0 text-[11px] text-zinc-500 font-medium tracking-wide">
                        <div className="flex items-center gap-4">
                            <span className="capitalize">{currentLang}</span>
                            <span>UTF-8</span>
                            {canRun && (
                                <span className="text-[#a7c8b3]/60">⌘↵ Run</span>
                            )}
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

                {/* Output panel */}
                {showOutput && (
                    <div className="flex-1 min-h-0 border-t border-white/[0.06]">
                        <RunOutputPanel
                            result={runResult}
                            running={running}
                            onClose={() => setShowOutput(false)}
                            onClear={() => setRunResult(null)}
                        />
                    </div>
                )}
            </div>

            {showDiffView && (
                <DiffViewModal
                    roomId={roomId}
                    currentSessionId={session.$id}
                    activeFile={activeFile}
                    files={parsedFiles}
                    ydoc={ydoc}
                    onClose={() => setShowDiffView(false)}
                />
            )}
        </div>
    );
}

// Languages supported by the run API
const RUNNABLE_LANGS: Record<string, boolean> = {
    javascript: true,
    typescript: true,
    python: true,
    rust: true,
    go: true,
};
