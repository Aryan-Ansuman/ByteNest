"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";
import { SiJavascript, SiTypescript, SiPython, SiRust, SiGo, SiHtml5, SiCss } from "@icons-pack/react-simple-icons";
import { motion } from "framer-motion";

const LANGUAGES = [
    { label: "JavaScript", value: "javascript", file: "index.js", icon: SiJavascript },
    { label: "TypeScript", value: "typescript", file: "index.ts", icon: SiTypescript },
    { label: "Python", value: "python", file: "main.py", icon: SiPython },
    { label: "Rust", value: "rust", file: "main.rs", icon: SiRust },
    { label: "Go", value: "go", file: "main.go", icon: SiGo },
    { label: "HTML", value: "html", file: "index.html", icon: SiHtml5 },
    { label: "CSS", value: "css", file: "style.css", icon: SiCss },
];

interface Props {
    roomId: string;
    onClose: () => void;
}

export default function SessionStartModal({ roomId, onClose }: Props) {
    const [lang, setLang] = useState(LANGUAGES[0]);
    const [customFilename, setCustomFilename] = useState(LANGUAGES[0].file);
    const [loading, setLoading] = useState(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    async function handleStart() {
        setLoading(true);
        try {
            await apiFetch(`/api/rooms/${roomId}/session`, {
                method: "POST",
                body: JSON.stringify({
                    language: lang.value,
                    filename: customFilename.trim() || lang.file,
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

    if (!mounted) return null;

    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[8px] p-4"
        >
            <motion.div
                initial={{ scale: 0.96 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="bg-[#0a0a0a] border border-white/5 rounded-2xl p-6 w-full max-w-[420px] space-y-5 shadow-2xl"
            >
                <div>
                    <h2 className="text-[28px] leading-tight font-[700] text-tx tracking-tight">
                        Start Code Session
                    </h2>
                    <p className="text-[14px] text-[#9fa0a7] mt-1.5">
                        Choose a starting language for your shared workspace.
                    </p>
                </div>

                <div className="space-y-1.5">
                    <p className="text-[11px] font-medium text-tx-muted">
                        Starting language
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {LANGUAGES.map((l) => (
                            <button
                                key={l.value}
                                onClick={() => {
                                    setLang(l);
                                    setCustomFilename(l.file);
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-[14px] border transition-all font-medium focus-visible:ring-[3px] focus-visible:ring-[#a7c8b3]/[0.18] focus-visible:outline-none",
                                    lang.value === l.value
                                        ? "bg-[#a7c8b3]/[0.12] border-[#a7c8b3] text-[#ddf4e5]"
                                        : "bg-[#141416] border-white/[0.08] text-[#cfcfd3] hover:bg-[#1b1b1f]"
                                )}
                            >
                                <l.icon className="w-3.5 h-3.5" />
                                {l.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 bg-[#141416] border border-white/[0.08] rounded-xl p-3.5 mt-2">
                    <div>
                        <p className="text-[10px] font-medium text-tx-muted mb-2 uppercase tracking-wider">Workspace</p>
                        <div className="flex items-center gap-1.5 focus-within:ring-1 focus-within:ring-[#a7c8b3]/30 rounded-md bg-[#0a0a0a] px-2 py-1.5 border border-white/5 transition-all">
                            <FileText className="w-4 h-4 text-zinc-500 shrink-0" />
                            <input
                                type="text"
                                value={customFilename}
                                onChange={(e) => setCustomFilename(e.target.value)}
                                className="bg-transparent text-[12px] text-zinc-300 font-mono focus:outline-none w-full min-w-0"
                                spellCheck={false}
                            />
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] font-medium text-tx-muted mb-2 uppercase tracking-wider">Language</p>
                        <div className="flex items-center gap-1.5">
                            <lang.icon className="w-3.5 h-3.5 text-[#a7c8b3]" />
                            <span className="text-[12px] text-zinc-300">{lang.label}</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 pt-5 border-t border-white/5 mt-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 rounded-lg text-xs font-medium text-tx-secondary hover:text-tx hover:bg-surface transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleStart}
                        disabled={loading}
                        className="flex-1 py-2 rounded-lg text-xs font-medium bg-brand text-[#0a0a0a] hover:bg-[#8eb09a] disabled:opacity-50 transition-colors"
                    >
                        {loading ? "Starting…" : "Start"}
                    </button>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
}
