"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Avatar({ name, small = false }: { name: string; small?: boolean }) {
    const initials =
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase())
            .join("") || "?";

    return (
        <span
            className={cn(
                "flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(135deg,#2D2D2D,#1A1A1A)] font-medium text-zinc-300",
                small ? "size-7 text-[10px]" : "size-10 text-sm"
            )}
        >
            {initials}
        </span>
    );
}

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    destructive = false,
    onConfirm,
    onCancel,
}: ConfirmDialogProps) {
    React.useEffect(() => {
        if (!open) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onCancel();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [open, onCancel]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                    onClick={onCancel}
                >
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0c0c0c] p-5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)]"
                    >
                        <div className="flex items-start gap-3">
                            <span
                                className={cn(
                                    "flex size-9 shrink-0 items-center justify-center rounded-xl border",
                                    destructive
                                        ? "border-red-500/20 bg-red-500/10 text-red-400"
                                        : "border-[#a7c8b3]/20 bg-[#a7c8b3]/10 text-[#a7c8b3]"
                                )}
                            >
                                <AlertTriangle className="size-4" />
                            </span>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
                                <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>
                            </div>
                        </div>

                        <div className="mt-5 flex items-center justify-end gap-2">
                            <button
                                onClick={onCancel}
                                className="flex h-9 items-center rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-zinc-300 transition hover:bg-white/[0.08]"
                            >
                                {cancelLabel}
                            </button>
                            <button
                                onClick={onConfirm}
                                className={cn(
                                    "flex h-9 items-center rounded-xl px-3.5 text-sm font-semibold transition",
                                    destructive
                                        ? "bg-red-500/90 text-white hover:bg-red-500"
                                        : "bg-[#a7c8b3] text-[#08100b] hover:bg-[#b4d6bf]"
                                )}
                            >
                                {confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
