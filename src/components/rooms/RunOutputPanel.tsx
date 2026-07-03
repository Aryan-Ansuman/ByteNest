"use client";

import { useRef, useEffect } from "react";
import { X, AlertCircle, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    language: string;
    durationMs: number;
    runAt: string;
}

interface Props {
    result: RunResult | null;
    running: boolean;
    onClose: () => void;
    onClear: () => void;
}

export default function RunOutputPanel({ result, running, onClose, onClear }: Props) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [result, running]);

    const succeeded = result && result.exitCode === 0 && !result.stderr;

    return (
        <div className="flex flex-col bg-[#0d0d0f] border-t border-white/[0.06] h-full min-h-0">
            {/* Header */}
            <div className="flex items-center gap-2 px-3 h-9 bg-[#111113] border-b border-white/[0.05] shrink-0">
                <span className="text-[11px] font-bold uppercase tracking-widest text-zinc-500">Output</span>
                {result && (
                    <span className={cn(
                        "flex items-center gap-1 text-[10px] font-semibold ml-1",
                        succeeded ? "text-[#a7c8b3]" : "text-rose-400"
                    )}>
                        {succeeded
                            ? <CheckCircle2 className="w-3 h-3" />
                            : <AlertCircle className="w-3 h-3" />
                        }
                        exit {result.exitCode} · {result.durationMs}ms · {result.language}
                    </span>
                )}
                <div className="flex-1" />
                {result && (
                    <button
                        onClick={onClear}
                        className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
                        title="Clear output"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
                <button
                    onClick={onClose}
                    className="p-1 rounded text-zinc-600 hover:text-zinc-400 transition-colors"
                    title="Close output panel"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Output body */}
            <div
                className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[12px] leading-relaxed"
                style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}
            >
                {running && (
                    <div className="flex items-center gap-2 text-zinc-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Running…</span>
                    </div>
                )}

                {!running && !result && (
                    <span className="text-zinc-600">No output yet. Press Run to execute the active file.</span>
                )}

                {result && (
                    <>
                        {result.stdout && (
                            <pre className="text-zinc-300 whitespace-pre-wrap break-words">{result.stdout}</pre>
                        )}
                        {result.stderr && (
                            <pre className="text-rose-400 whitespace-pre-wrap break-words mt-1">{result.stderr}</pre>
                        )}
                        {!result.stdout && !result.stderr && (
                            <span className="text-zinc-600 italic">No output produced.</span>
                        )}
                    </>
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
