"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, Loader2, ChevronDown, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";
import type { VerificationStatus } from "./QuestionDetailContext";

const POLL_INTERVAL_MS = 4_000;
const POLL_MAX_ATTEMPTS = 75; // ~5 minutes — generous since the worker is cron-driven, not instant

interface TestRunEvidence {
    status: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number | null;
    pistonRuntime: string | null;
    createdAt: string;
    completedAt: string | null;
}

interface Props {
    answerId: string;
    initialStatus: VerificationStatus | undefined;
    initialScore?: number | null;
    /** Answer author or question author — the only people who can retry an "error" badge. */
    canRetry: boolean;
}

export default function VerificationBadge({ answerId, initialStatus, initialScore, canRetry }: Props) {
    const [status, setStatus] = React.useState<VerificationStatus>(initialStatus ?? "unverified");
    const [score, setScore] = React.useState<number | null | undefined>(initialScore);
    const [expanded, setExpanded] = React.useState(false);
    const [evidence, setEvidence] = React.useState<TestRunEvidence | null>(null);
    const [loadingEvidence, setLoadingEvidence] = React.useState(false);
    const [retrying, setRetrying] = React.useState(false);

    const isLive = status === "pending" || status === "processing";

    // ── Poll while verification is in flight ──────────────────────────
    React.useEffect(() => {
        if (!isLive) return;
        let attempts = 0;
        let cancelled = false;

        const interval = setInterval(async () => {
            attempts += 1;
            if (attempts > POLL_MAX_ATTEMPTS) {
                clearInterval(interval);
                return;
            }
            try {
                const res = await apiFetch(`/api/answer/${answerId}/verification`);
                if (cancelled) return;
                if (res.verificationStatus !== status) {
                    setStatus(res.verificationStatus);
                    setScore(res.verificationScore);
                }
            } catch {
                // Transient — keep polling, the badge just stays in "Verifying…" until it works.
            }
        }, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [isLive, answerId, status]);

    // ── Lazy-load evidence on first expand ─────────────────────────────
    async function toggleExpanded() {
        const next = !expanded;
        setExpanded(next);
        if (next && !evidence) {
            setLoadingEvidence(true);
            try {
                const res = await apiFetch(`/api/answer/${answerId}/verification`);
                setEvidence(res.latestTestRun);
                setStatus(res.verificationStatus);
                setScore(res.verificationScore);
            } catch {
                toast.error("Couldn't load verification details");
            } finally {
                setLoadingEvidence(false);
            }
        }
    }

    async function handleRetry(e: React.MouseEvent) {
        e.stopPropagation();
        if (retrying) return;
        setRetrying(true);
        try {
            await apiFetch(`/api/answer/${answerId}/verification/retry`, { method: "POST" });
            setStatus("pending");
            setEvidence(null);
            toast.success("Re-running tests…");
        } catch (err: any) {
            toast.error(err?.message ?? "Couldn't retry verification");
        } finally {
            setRetrying(false);
        }
    }

    if (status === "unverified") {
        return (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-500">
                Unverified
            </span>
        );
    }

    const config = BADGE_CONFIG[status as keyof typeof BADGE_CONFIG];
    const clickable = status === "passed" || status === "failed" || status === "error";

    return (
        <div className="inline-flex flex-col">
            <button
                onClick={clickable ? toggleExpanded : undefined}
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    config?.className,
                    clickable && "cursor-pointer hover:brightness-110",
                    !clickable && "cursor-default"
                )}
            >
                {isLive ? (
                    <motion.span
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                        className="flex items-center gap-1.5"
                    >
                        <Loader2 className="size-3 animate-spin" />
                        Verifying…
                    </motion.span>
                ) : (
                    <>
                        {config?.icon}
                        {config?.label}
                        {status === "passed" || status === "failed" ? (
                            <span className="opacity-70">
                                {typeof score === "number" ? `· ${score}% tests passed` : ""}
                            </span>
                        ) : null}
                        {clickable && (
                            <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
                        )}
                    </>
                )}

                {status === "error" && canRetry && (
                    <span
                        onClick={handleRetry}
                        title="Retry verification"
                        className={cn(
                            "ml-1 flex items-center gap-1 rounded-full border border-current/30 px-1.5 py-0.5 text-[10px]",
                            retrying && "opacity-50"
                        )}
                    >
                        <RotateCw className={cn("size-2.5", retrying && "animate-spin")} />
                        Retry
                    </span>
                )}
            </button>

            <AnimatePresence>
                {expanded && clickable && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2 max-w-md rounded-xl border border-white/5 bg-[#0a0a0a] p-3">
                            {loadingEvidence ? (
                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                    <Loader2 className="size-3.5 animate-spin" />
                                    Loading evidence…
                                </div>
                            ) : evidence ? (
                                <div className="space-y-2 text-xs">
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-zinc-500">
                                        {evidence.exitCode !== null && <span>exit code {evidence.exitCode}</span>}
                                        {evidence.durationMs !== null && <span>{evidence.durationMs}ms</span>}
                                        {evidence.pistonRuntime && <span>{evidence.pistonRuntime}</span>}
                                    </div>
                                    {evidence.stdout && (
                                        <div>
                                            <p className="mb-1 font-semibold text-zinc-600">stdout</p>
                                            <pre className="max-h-40 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-zinc-300">
                                                {evidence.stdout}
                                            </pre>
                                        </div>
                                    )}
                                    {evidence.stderr && (
                                        <div>
                                            <p className="mb-1 font-semibold text-zinc-600">stderr</p>
                                            <pre className="max-h-40 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-red-300/90">
                                                {evidence.stderr}
                                            </pre>
                                        </div>
                                    )}
                                    {!evidence.stdout && !evidence.stderr && (
                                        <p className="text-zinc-600 italic">No output captured for this run.</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-zinc-600 italic">No test run recorded yet.</p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const BADGE_CONFIG: Record<
    Exclude<VerificationStatus, "unverified" | "pending" | "processing">,
    { label: string; icon: React.ReactNode; className: string }
> = {
    passed: {
        label: "✓ Verified",
        icon: <CheckCircle2 className="size-3" />,
        className: "border-emerald-500/20 bg-emerald-950/30 text-emerald-400",
    },
    failed: {
        label: "✗ Tests Failing",
        icon: <XCircle className="size-3" />,
        className: "border-red-500/20 bg-red-950/30 text-red-400",
    },
    error: {
        label: "⚠ Verification Error",
        icon: <AlertTriangle className="size-3" />,
        className: "border-amber-500/20 bg-amber-950/30 text-amber-400",
    },
};
