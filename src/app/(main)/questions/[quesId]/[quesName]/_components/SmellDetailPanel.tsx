"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { groupSmellsForPanel, parseSmellEvidence, type ConfidenceLevel } from "./smellEvidence";

interface Props {
    systemTags: string[];
    smellEvidence: string | null | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Which smell (if any) was clicked to open the panel — scrolled into view and lightly highlighted. */
    focusedSmellId?: string | null;
}

export default function SmellDetailPanel({ systemTags, smellEvidence, open, onOpenChange, focusedSmellId }: Props) {
    const evidence = React.useMemo(() => parseSmellEvidence(smellEvidence), [smellEvidence]);
    const smells = React.useMemo(() => groupSmellsForPanel(systemTags, evidence), [systemTags, evidence]);

    if (smells.length === 0) return null;

    return (
        <div className="mt-5 overflow-hidden rounded-xl border border-amber-500/15 bg-amber-950/[0.07]">
            <button
                onClick={() => onOpenChange(!open)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-amber-500/[0.04]"
                aria-expanded={open}
            >
                <span className="text-sm font-medium text-amber-200/90">
                    🔍 System Analysis — {smells.length} code smell{smells.length === 1 ? "" : "s"} detected
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-amber-400/70 transition-transform", open && "rotate-180")} />
            </button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-4 border-t border-amber-500/10 px-4 py-4">
                            {smells.map((smell) => (
                                <SmellRow key={smell.id} smell={smell} focused={smell.id === focusedSmellId} />
                            ))}

                            <FeedbackPrompt />

                            <p className="border-t border-amber-500/10 pt-3 text-[11px] leading-relaxed text-zinc-500">
                                This analysis was performed automatically by ByteNest&apos;s static analysis engine.
                                Detections are informational and may not reflect the root cause of your issue.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function SmellRow({
    smell,
    focused,
}: {
    smell: ReturnType<typeof groupSmellsForPanel>[number];
    focused: boolean;
}) {
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (focused) ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [focused]);

    return (
        <div
            ref={ref}
            className={cn(
                "rounded-lg border px-3.5 py-3 transition-colors",
                focused ? "border-amber-400/40 bg-amber-500/[0.06]" : "border-white/[0.06] bg-white/[0.02]"
            )}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-semibold text-zinc-100">{smell.displayName}</span>
                <ConfidenceDots level={smell.confidence} />
            </div>

            <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{smell.description}</p>

            {smell.entries.map((entry, i) => (
                <EvidenceSnippet key={i} entry={entry} />
            ))}
        </div>
    );
}

function ConfidenceDots({ level }: { level: ConfidenceLevel }) {
    const filled = level === "high" ? 3 : level === "medium" ? 2 : 1;
    const label = `${level} confidence`;

    return (
        <span title={label} aria-label={label} className="flex items-center gap-1">
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className={cn(
                        "size-1.5 rounded-full",
                        i < filled ? "bg-amber-400" : "bg-white/10"
                    )}
                />
            ))}
        </span>
    );
}

function EvidenceSnippet({ entry }: { entry: ReturnType<typeof groupSmellsForPanel>[number]["entries"][number] }) {
    if (entry.triggeredBy) {
        const highlightedLines = new Set(entry.lineNumbers ?? []);
        const lines = entry.triggeredBy.split("\n");

        return (
            <div className="mt-2 overflow-x-auto rounded-md border border-white/[0.06] bg-black/40">
                <pre className="px-3 py-2 text-[12px] leading-relaxed">
                    {lines.map((line, i) => (
                        <div
                            key={i}
                            className={cn(
                                "font-mono",
                                highlightedLines.size > 0 && highlightedLines.has(i + 1)
                                    ? "bg-amber-500/10 text-amber-200"
                                    : "text-zinc-400"
                            )}
                        >
                            {line || " "}
                        </div>
                    ))}
                </pre>
            </div>
        );
    }

    if (entry.reasoning) {
        return (
            <p className="mt-2 rounded-md border border-white/[0.06] bg-black/20 px-3 py-2 text-[12px] italic leading-relaxed text-zinc-500">
                &ldquo;{entry.reasoning}&rdquo;
            </p>
        );
    }

    return null;
}

/**
 * Phase 7 wires this up to POST /api/smell-feedback and denormalizes the
 * tally into `smellFeedbackSummary` on the question. For now this is a
 * local, non-persisted acknowledgment so the surface exists in Phase 6.
 */
function FeedbackPrompt() {
    const [voted, setVoted] = React.useState<"correct" | "incorrect" | null>(null);

    function handleVote(verdict: "correct" | "incorrect") {
        setVoted(verdict);
        toast.success(
            verdict === "correct" ? "Thanks — glad that was useful." : "Thanks for the feedback."
        );
    }

    return (
        <div className="flex items-center gap-3 border-t border-amber-500/10 pt-3">
            <span className="text-xs text-zinc-500">Was this detection helpful?</span>
            <div className="flex items-center gap-1.5">
                <button
                    onClick={() => handleVote("correct")}
                    disabled={voted !== null}
                    aria-pressed={voted === "correct"}
                    className={cn(
                        "flex size-7 items-center justify-center rounded-lg border transition disabled:cursor-default",
                        voted === "correct"
                            ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                            : "border-white/[0.08] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                    )}
                >
                    <ThumbsUp className="size-3.5" />
                </button>
                <button
                    onClick={() => handleVote("incorrect")}
                    disabled={voted !== null}
                    aria-pressed={voted === "incorrect"}
                    className={cn(
                        "flex size-7 items-center justify-center rounded-lg border transition disabled:cursor-default",
                        voted === "incorrect"
                            ? "border-red-400/40 bg-red-500/10 text-red-300"
                            : "border-white/[0.08] text-zinc-500 hover:border-white/20 hover:text-zinc-300"
                    )}
                >
                    <ThumbsDown className="size-3.5" />
                </button>
            </div>
        </div>
    );
}
