"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
    answerId: string;
    stalenessVoteCount: number;
    hasReported: boolean;
    disabled?: boolean;
    onReported: (count: number) => void;
    onRetracted: (count: number) => void;
}

export default function StalenessReportButton({
    answerId,
    stalenessVoteCount,
    hasReported,
    disabled = false,
    onReported,
    onRetracted,
}: Props) {
    const [modalOpen, setModalOpen] = React.useState(false);
    const [reportedVersion, setReportedVersion] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (submitting) return;
        setSubmitting(true);
        try {
            const res = await apiFetch<{ data: { stalenessVoteCount: number } }>(
                "/api/staleness-vote",
                {
                    method: "POST",
                    body: JSON.stringify({
                        answerId,
                        reportedVersion: reportedVersion.trim() || undefined,
                    }),
                }
            );
            onReported(res.data.stalenessVoteCount);
            toast.success("Thanks — marked as reported");
            setModalOpen(false);
            setReportedVersion("");
        } catch (error: any) {
            toast.error(error?.message ?? "Couldn't submit your report");
        } finally {
            setSubmitting(false);
        }
    }

    async function handleRetract() {
        if (submitting) return;
        setSubmitting(true);
        try {
            const res = await apiFetch<{ data: { stalenessVoteCount: number } }>(
                "/api/staleness-vote",
                {
                    method: "DELETE",
                    body: JSON.stringify({ answerId }),
                }
            );
            onRetracted(res.data.stalenessVoteCount);
            toast.success("Report retracted");
        } catch (error: any) {
            toast.error(error?.message ?? "Couldn't retract your report");
        } finally {
            setSubmitting(false);
        }
    }

    if (hasReported) {
        return (
            <span className="flex items-center gap-2 text-[13px] font-medium text-amber-400/90">
                You reported this
                <button
                    onClick={handleRetract}
                    disabled={disabled || submitting}
                    className="text-zinc-500 underline underline-offset-2 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {submitting ? "Retracting…" : "Retract"}
                </button>
            </span>
        );
    }

    return (
        <>
            <button
                onClick={() => setModalOpen(true)}
                disabled={disabled}
                className="flex items-center gap-2 transition hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <AlertOctagon className="size-4" />
                No longer works?
                {stalenessVoteCount > 0 && (
                    <span className="text-zinc-600">
                        {stalenessVoteCount} user{stalenessVoteCount === 1 ? "" : "s"} reported issues
                    </span>
                )}
            </button>

            <AnimatePresence>
                {modalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
                        onClick={() => {
                            if (!submitting) setModalOpen(false);
                        }}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.97 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-sm rounded-2xl border border-white/5 bg-[#0c0c0c] p-5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)]"
                        >
                            <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold text-zinc-100">
                                        Which version were you using?
                                    </h3>
                                    <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                                        Let others know this answer didn&apos;t work for you.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setModalOpen(false)}
                                    disabled={submitting}
                                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-300"
                                >
                                    <X className="size-4" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit}>
                                <input
                                    type="text"
                                    value={reportedVersion}
                                    onChange={(e) => setReportedVersion(e.target.value)}
                                    placeholder="e.g. 19.0"
                                    maxLength={30}
                                    autoFocus
                                    disabled={submitting}
                                    className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3.5 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition focus:border-[#CFE8D5]/30 disabled:cursor-not-allowed disabled:opacity-50"
                                />

                                <div className="mt-4 flex items-center justify-end gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setModalOpen(false)}
                                        disabled={submitting}
                                        className="flex h-9 items-center rounded-xl border border-white/5 bg-white/[0.04] px-3.5 text-sm text-zinc-300 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className={cn(
                                            "flex h-9 items-center gap-2 rounded-xl bg-[#CFE8D5] px-3.5 text-sm font-semibold text-[#08100b] transition hover:bg-[#ddf3e2] disabled:cursor-wait disabled:opacity-70"
                                        )}
                                    >
                                        {submitting && <Loader2 className="size-3.5 animate-spin" />}
                                        {submitting ? "Submitting…" : "Submit report"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
