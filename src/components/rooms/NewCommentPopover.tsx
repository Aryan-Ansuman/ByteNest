"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";

interface Props {
    line: number;
    onSubmit: (body: string) => Promise<void>;
    onClose: () => void;
}

export function NewCommentPopover({ line, onSubmit, onClose }: Props) {
    const [body, setBody] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    async function handleSubmit() {
        const text = body.trim();
        if (!text || submitting) return;
        setSubmitting(true);
        try {
            await onSubmit(text);
            onClose();
        } catch (e: any) {
            toast.error(e?.message ?? "Failed to add comment");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="w-[300px] rounded-xl border border-[#a7c8b3]/30 bg-[#17171b] shadow-2xl shadow-black/50 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.02]">
                <span className="text-[11px] font-semibold text-zinc-300">
                    New comment · Line {line}
                </span>
                <button
                    onClick={onClose}
                    className="p-1 rounded-md hover:bg-white/[0.06] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
            <div className="p-2.5 space-y-2">
                <textarea
                    ref={inputRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSubmit();
                        }
                        if (e.key === "Escape") onClose();
                    }}
                    placeholder="Leave a review comment…"
                    rows={3}
                    className="w-full bg-white/[0.04] border border-white/5 rounded-lg px-2.5 py-2 text-[12px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#a7c8b3]/50 resize-none"
                />
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!body.trim() || submitting}
                        className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-[#a7c8b3] text-[#08100b] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-white transition-colors"
                    >
                        {submitting ? "Posting…" : "Comment"}
                    </button>
                </div>
            </div>
        </div>
    );
}
