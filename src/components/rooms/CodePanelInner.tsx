"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import type * as MonacoType from "monaco-editor";
import * as Y from "yjs";
import { MonacoBinding } from "y-monaco";
import type { CodeSession, SessionFile } from "@/types/rooms";
import { useRoomStore } from "@/store/roomStore";
import { useCodeSession } from "@/hooks/useCodeSession";
import { uint8ToBase64 } from "@/lib/yjs/utils";
import { toast } from "sonner";
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
    async function handleEndSession() {
        if (!ydoc) return;
        const state = Y.encodeStateAsUpdate(ydoc);
        try {
            await apiFetch(`/api/rooms/${roomId}/session/${session.$id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    action: "end",
                    yjsSnapshotB64: uint8ToBase64(state),
                }),
            });
        } catch {
            // best effort
        }
    }

    const currentLang =
        parsedFiles.find((f) => f.name === activeFile)?.language ?? "javascript";

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a]">
            {/* File tab bar */}
            <FileTabBar
                files={parsedFiles}
                activeFile={activeFile}
                isHost={isHost}
                roomId={roomId}
                sessionId={session.$id}
                onSwitch={handleSwitchFile}
                onAddFile={handleAddFile}
            />

            {/* Host toolbar */}
            {isHost && (
                <div className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 border-b border-zinc-800 shrink-0">
                    <ViewOnlyToggle
                        roomId={roomId}
                        sessionId={session.$id}
                        isHost={isHost}
                        viewOnly={liveSession.viewOnly}
                    />
                    <div className="flex-1" />
                    <button
                        onClick={handleEndSession}
                        className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-colors"
                    >
                        End Session
                    </button>
                </div>
            )}

            {/* View-only banner for non-hosts */}
            {isViewOnly && (
                <div className="shrink-0 text-center py-1.5 text-[11px] font-medium text-amber-400 bg-amber-500/10 border-b border-amber-500/20">
                    🔒 View only — the host has disabled editing
                </div>
            )}

            {/* Monaco */}
            <div className="flex-1 overflow-hidden">
                <Editor
                    height="100%"
                    language={currentLang}
                    theme="vs-dark"
                    onMount={handleEditorDidMount}
                    options={{
                        readOnly: isViewOnly,
                        fontSize: 13,
                        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        padding: { top: 12 },
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
        </div>
    );
}
