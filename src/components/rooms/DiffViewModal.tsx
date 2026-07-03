"use client";

import { useEffect, useMemo, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import * as Y from "yjs";
import { X, GitCompare, Loader2, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useSessionHistory, type SessionHistoryEntry } from "@/hooks/useSessionHistory";
import type { SessionFile } from "@/types/rooms";

type CompareSource =
    | { kind: "session"; sessionId: string; filename: string }
    | { kind: "file"; filename: string };

interface Props {
    roomId: string;
    /** The currently active session — its live ydoc supplies the "modified" side */
    currentSessionId: string;
    activeFile: string;
    files: SessionFile[];
    ydoc: Y.Doc | null;
    onClose: () => void;
}

const LANG_TO_MONACO: Record<string, string> = {
    javascript: "javascript",
    typescript: "typescript",
    python: "python",
    rust: "rust",
    go: "go",
    html: "html",
    css: "css",
};

export function DiffViewModal({
    roomId,
    currentSessionId,
    activeFile,
    files,
    ydoc,
    onClose,
}: Props) {
    const { sessions, loading: sessionsLoading, getFileTextFromSession } = useSessionHistory(roomId);

    const [source, setSource] = useState<CompareSource | null>(null);
    const [originalText, setOriginalText] = useState("");
    const [loadingOriginal, setLoadingOriginal] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);

    const currentFile = files.find((f) => f.name === activeFile);
    const monacoLang = LANG_TO_MONACO[currentFile?.language ?? "javascript"] ?? "plaintext";

    // "Modified" side — the live text of the active file, read once on open.
    // The diff view is a point-in-time snapshot comparison, not a live feed,
    // so we don't subscribe to further ydoc updates here.
    const modifiedText = useMemo(() => {
        if (!ydoc) return "";
        try {
            return ydoc.getText(activeFile).toString();
        } catch {
            return "";
        }
    }, [ydoc, activeFile]);

    // Default to comparing against the most recent past session, same filename
    useEffect(() => {
        if (source || sessionsLoading) return;
        const mostRecent = sessions.find((s) =>
            s.files.some((f) => f.name === activeFile)
        );
        if (mostRecent) {
            setSource({ kind: "session", sessionId: mostRecent.$id, filename: activeFile });
        } else if (files.length > 1) {
            const other = files.find((f) => f.name !== activeFile);
            if (other) setSource({ kind: "file", filename: other.name });
        }
    }, [sessions, sessionsLoading, source, activeFile, files]);

    // Load original text whenever the chosen comparison source changes
    useEffect(() => {
        if (!source) {
            setOriginalText("");
            return;
        }
        let cancelled = false;
        setLoadingOriginal(true);

        (async () => {
            try {
                if (source.kind === "session") {
                    const text = await getFileTextFromSession(source.sessionId, source.filename);
                    if (!cancelled) setOriginalText(text);
                } else {
                    // Compare against another file in the *current* live session
                    const text = ydoc?.getText(source.filename).toString() ?? "";
                    if (!cancelled) setOriginalText(text);
                }
            } finally {
                if (!cancelled) setLoadingOriginal(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [source, getFileTextFromSession, ydoc]);

    function describeSource(s: CompareSource | null): string {
        if (!s) return "Choose a comparison…";
        if (s.kind === "file") return `Live: ${s.filename}`;
        const session = sessions.find((sess) => sess.$id === s.sessionId);
        if (!session) return "Previous session";
        const when = session.endedAt ?? session.$createdAt;
        try {
            return `${s.filename} — ${format(new Date(when), "MMM d, h:mm a")}`;
        } catch {
            return s.filename;
        }
    }

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-[1100px] h-[80vh] rounded-2xl border border-white/10 bg-[#0e0e10] shadow-2xl shadow-black/60 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-2">
                        <GitCompare className="w-4 h-4 text-[#a7c8b3]" />
                        <h2 className="text-[14px] font-semibold text-zinc-100">Compare changes</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Source picker bar */}
                <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-white/5 bg-[#111113] relative z-20">
                    <span className="text-[11px] font-medium text-zinc-500 w-16 shrink-0">Original</span>

                    <div className="relative">
                        <button
                            onClick={() => setPickerOpen((v) => !v)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/5 text-[12px] text-zinc-200 hover:bg-white/[0.06] transition-colors"
                        >
                            {describeSource(source)}
                            <ChevronDown className="w-3 h-3 text-zinc-500" />
                        </button>

                        {pickerOpen && (
                            <div className="absolute left-0 top-full mt-1.5 w-[300px] max-h-[320px] overflow-y-auto rounded-xl border border-white/10 bg-[#17171b] shadow-2xl z-50 p-1.5">
                                {sessionsLoading && (
                                    <div className="px-2.5 py-3 text-[12px] text-zinc-500 flex items-center gap-2">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Loading session history…
                                    </div>
                                )}

                                {!sessionsLoading && sessions.length === 0 && (
                                    <p className="px-2.5 py-3 text-[12px] text-zinc-500">
                                        No previous sessions yet — start and end a session to compare against it later.
                                    </p>
                                )}

                                {sessions.length > 0 && (
                                    <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                                        Previous sessions
                                    </p>
                                )}
                                {sessions.map((s) => (
                                    <SessionOption
                                        key={s.$id}
                                        session={s}
                                        activeFile={activeFile}
                                        selected={source?.kind === "session" && source.sessionId === s.$id}
                                        onPick={(filename) => {
                                            setSource({ kind: "session", sessionId: s.$id, filename });
                                            setPickerOpen(false);
                                        }}
                                    />
                                ))}

                                {files.length > 1 && (
                                    <>
                                        <p className="px-2.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 border-t border-white/5 mt-1">
                                            Compare with another file
                                        </p>
                                        {files
                                            .filter((f) => f.name !== activeFile)
                                            .map((f) => (
                                                <button
                                                    key={f.name}
                                                    onClick={() => {
                                                        setSource({ kind: "file", filename: f.name });
                                                        setPickerOpen(false);
                                                    }}
                                                    className={cn(
                                                        "w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] font-mono transition-colors",
                                                        source?.kind === "file" && source.filename === f.name
                                                            ? "bg-[#a7c8b3]/10 text-[#a7c8b3]"
                                                            : "text-zinc-300 hover:bg-white/[0.04]"
                                                    )}
                                                >
                                                    {f.name}
                                                </button>
                                            ))}
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    <span className="text-zinc-700">→</span>

                    <span className="text-[11px] font-medium text-zinc-500 w-16 shrink-0">Modified</span>
                    <span className="px-2.5 py-1.5 rounded-lg bg-[#a7c8b3]/10 border border-[#a7c8b3]/20 text-[12px] font-mono text-[#a7c8b3]">
                        {activeFile} (live)
                    </span>
                </div>

                {/* Diff editor */}
                <div className="flex-1 min-h-0 relative">
                    {(loadingOriginal || !source) && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0e0e10]/80 backdrop-blur-sm">
                            <div className="flex items-center gap-2 text-zinc-500 text-[13px]">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {source ? "Loading comparison…" : "Select something to compare against"}
                            </div>
                        </div>
                    )}

                    <DiffEditor
                        height="100%"
                        language={monacoLang}
                        originalLanguage={monacoLang}
                        modifiedLanguage={monacoLang}
                        original={originalText}
                        modified={modifiedText}
                        theme="vs-dark"
                        options={{
                            readOnly: true,
                            renderSideBySide: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            scrollBeyondLastLine: false,
                            // Diff view is read-only display only — no Yjs binding,
                            // no editing, no collaborative cursors here.
                            originalEditable: false,
                        }}
                        loading={
                            <div className="flex h-full items-center justify-center text-zinc-600 text-sm">
                                Loading diff editor…
                            </div>
                        }
                    />
                </div>
            </div>
        </div>
    );
}

function SessionOption({
    session,
    activeFile,
    selected,
    onPick,
}: {
    session: SessionHistoryEntry;
    activeFile: string;
    selected: boolean;
    onPick: (filename: string) => void;
}) {
    const hasActiveFile = session.files.some((f) => f.name === activeFile);
    const when = session.endedAt ?? session.$createdAt;
    const label = (() => {
        try {
            return format(new Date(when), "MMM d, yyyy · h:mm a");
        } catch {
            return "Unknown date";
        }
    })();

    // Prefer comparing the same filename if it exists in that snapshot,
    // otherwise let the user pick any file that did exist in it.
    if (hasActiveFile) {
        return (
            <button
                onClick={() => onPick(activeFile)}
                className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] transition-colors",
                    selected ? "bg-[#a7c8b3]/10 text-[#a7c8b3]" : "text-zinc-300 hover:bg-white/[0.04]"
                )}
            >
                <span className="font-mono">{activeFile}</span>
                <span className="block text-[10px] text-zinc-600 mt-0.5">{label}</span>
            </button>
        );
    }

    if (session.files.length === 0) return null;

    return (
        <div className="px-2.5 py-1.5 rounded-lg">
            <span className="block text-[10px] text-zinc-600 mb-1">{label} — different files</span>
            <div className="flex flex-wrap gap-1">
                {session.files.map((f) => (
                    <button
                        key={f.name}
                        onClick={() => onPick(f.name)}
                        className="px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[10px] font-mono text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 transition-colors"
                    >
                        {f.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
