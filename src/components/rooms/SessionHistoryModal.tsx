"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { format } from "date-fns";
import { X, Download, Code2, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CodeSession, SessionFile } from "@/types/rooms";
import { toast } from "sonner";
import * as Y from "yjs";
import { base64ToUint8 } from "@/lib/yjs/utils";

interface Props {
    roomId: string;
    onClose: () => void;
}

export default function SessionHistoryModal({ roomId, onClose }: Props) {
    const [sessions, setSessions] = useState<CodeSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<CodeSession | null>(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        apiFetch<{ sessions: CodeSession[] }>(`/api/rooms/${roomId}/sessions`)
            .then((r) => setSessions(r.sessions))
            .catch(() => toast.error("Failed to load session history"))
            .finally(() => setLoading(false));
    }, [roomId]);

    async function handleExport(session: CodeSession) {
        if (!session.yjsSnapshotB64) {
            toast.error("No code snapshot available for this session");
            return;
        }
        setExporting(true);
        try {
            const ydoc = new Y.Doc();
            const state = base64ToUint8(session.yjsSnapshotB64);
            Y.applyUpdate(ydoc, state);

            const files: SessionFile[] = JSON.parse(session.files ?? "[]");

            if (files.length === 1) {
                // Single file — download directly
                const content = ydoc.getText(files[0].name).toString();
                downloadFile(files[0].name, content);
            } else {
                // Multiple files — download each
                for (const file of files) {
                    const content = ydoc.getText(file.name).toString();
                    await new Promise((r) => setTimeout(r, 120));
                    downloadFile(file.name, content);
                }
            }
            toast.success("Code exported");
        } catch {
            toast.error("Export failed");
        } finally {
            setExporting(false);
        }
    }

    function downloadFile(name: string, content: string) {
        const blob = new Blob([content], { type: "text/plain" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = name;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg bg-[#111113] border border-white/[0.08] rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <Code2 className="w-4 h-4 text-[#a7c8b3]" />
                        <h2 className="text-[14px] font-semibold text-zinc-100">Session History</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ scrollbarWidth: "thin" }}>
                    {loading && (
                        <div className="flex items-center justify-center py-12 text-zinc-500 gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Loading sessions…</span>
                        </div>
                    )}
                    {!loading && sessions.length === 0 && (
                        <p className="text-center text-sm text-zinc-600 py-12">
                            No past sessions found for this room.
                        </p>
                    )}
                    {sessions.map((s) => {
                        const files: SessionFile[] = (() => { try { return JSON.parse(s.files ?? "[]"); } catch { return []; } })();
                        const isSelected = selected?.$id === s.$id;
                        return (
                            <div
                                key={s.$id}
                                className={cn(
                                    "p-3.5 rounded-xl border transition-all cursor-pointer",
                                    isSelected
                                        ? "border-[#a7c8b3]/30 bg-[#a7c8b3]/5"
                                        : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-zinc-700"
                                )}
                                onClick={() => setSelected(isSelected ? null : s)}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                "w-1.5 h-1.5 rounded-full shrink-0",
                                                s.status === "active" ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
                                            )} />
                                            <span className="text-[13px] font-medium text-zinc-100">
                                                {files.map((f) => f.name).join(", ") || "Unnamed session"}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {format(new Date(s.$createdAt), "MMM d, yyyy · h:mm a")}
                                            </span>
                                            {s.endedAt && (
                                                <span>→ {format(new Date(s.endedAt), "h:mm a")}</span>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleExport(s); }}
                                        disabled={exporting || !s.yjsSnapshotB64}
                                        className={cn(
                                            "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all shrink-0",
                                            s.yjsSnapshotB64
                                                ? "bg-white/[0.04] border border-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08]"
                                                : "text-zinc-700 cursor-not-allowed"
                                        )}
                                        title={s.yjsSnapshotB64 ? "Export code" : "No snapshot available"}
                                    >
                                        {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                        Export
                                    </button>
                                </div>

                                {/* Expanded file list */}
                                {isSelected && files.length > 0 && (
                                    <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-1.5">
                                        {files.map((f) => (
                                            <span
                                                key={f.name}
                                                className="font-mono text-[11px] px-2 py-0.5 rounded bg-white/[0.04] border border-white/5 text-zinc-400"
                                            >
                                                {f.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
