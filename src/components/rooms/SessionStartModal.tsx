"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";

const LANGUAGES = [
    { label: "JavaScript", value: "javascript", file: "index.js" },
    { label: "TypeScript", value: "typescript", file: "index.ts" },
    { label: "Python", value: "python", file: "main.py" },
    { label: "Rust", value: "rust", file: "main.rs" },
    { label: "Go", value: "go", file: "main.go" },
    { label: "HTML", value: "html", file: "index.html" },
    { label: "CSS", value: "css", file: "style.css" },
];

interface Props {
    roomId: string;
    onClose: () => void;
}

export default function SessionStartModal({ roomId, onClose }: Props) {
    const [lang, setLang] = useState(LANGUAGES[0]);
    const [loading, setLoading] = useState(false);

    async function handleStart() {
        setLoading(true);
        try {
            await apiFetch(`/api/rooms/${roomId}/session`, {
                method: "POST",
                body: JSON.stringify({
                    language: lang.value,
                    filename: lang.file,
                }),
            });

            onClose();
            // Realtime fires on room document update → code panel animates in
        } catch (error: any) {
            toast.error(error?.message ?? "Failed to start session");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl p-6 w-80 space-y-5 shadow-2xl">
                <div>
                    <h2 className="text-sm font-semibold text-zinc-100">
                        Start Code Session
                    </h2>
                    <p className="text-xs text-zinc-500 mt-1">
                        All room members will see the editor open live
                    </p>
                </div>

                <div className="space-y-2">
                    <p className="text-[11px] font-medium text-zinc-500">
                        Starting language
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {LANGUAGES.map((l) => (
                            <button
                                key={l.value}
                                onClick={() => setLang(l)}
                                className={[
                                    "text-xs px-3 py-2 rounded-lg border text-left transition-colors font-medium",
                                    lang.value === l.value
                                        ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                                        : "bg-zinc-800/30 border-zinc-800 text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-300",
                                ].join(" ")}
                            >
                                {l.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-black/40 rounded-lg px-3 py-2 border border-zinc-800/50">
                    <span className="text-[11px] text-zinc-500">
                        First file:{" "}
                    </span>
                    <span className="text-[11px] text-zinc-300 font-mono">
                        {lang.file}
                    </span>
                </div>

                <div className="flex gap-2 pt-2 border-t border-zinc-800">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleStart}
                        disabled={loading}
                        className="flex-1 py-2 rounded-lg text-xs font-medium bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50 transition-colors"
                    >
                        {loading ? "Starting…" : "Start"}
                    </button>
                </div>
            </div>
        </div>
    );
}
