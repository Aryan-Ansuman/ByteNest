"use client";

import React from "react";
import Link from "next/link";
import { Zap, Clock, ChevronRight, LogIn, CheckCircle2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { useAuthStore } from "@/store/Auth";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { cn } from "@/lib/utils";
import type { GapQuestion } from "@/app/api/answer-gaps/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type ApiResponse = {
    data: GapQuestion[];
    meta: {
        reason: "ok" | "no_gaps" | "no_skill_data";
        count: number;
    };
};

type WidgetState =
    | { status: "loading" }
    | { status: "unauthenticated" }
    | { status: "no_skill_data" }
    | { status: "empty" }
    | { status: "loaded"; gaps: GapQuestion[] };

// ─── Urgency helpers ──────────────────────────────────────────────────────────

function getUrgencyLevel(hoursWaiting: number): "normal" | "elevated" | "high" {
    if (hoursWaiting >= 12) return "high";
    if (hoursWaiting >= 6)  return "elevated";
    return "normal";
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
// Matches the height of three populated rows so there is zero layout shift.

function GapSkeleton() {
    return (
        <div className="space-y-3" role="status" aria-label="Loading answer gaps">
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
                >
                    {/* Title line */}
                    <div
                        className="h-3.5 animate-pulse rounded bg-white/[0.07]"
                        style={{ width: `${72 - i * 8}%` }}
                    />
                    {/* Badge + meta row */}
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-20 animate-pulse rounded-full bg-white/[0.05]" />
                        <div className="h-3 w-16 animate-pulse rounded bg-white/[0.04]" />
                    </div>
                </div>
            ))}
            <span className="sr-only">Loading personalized question gaps…</span>
        </div>
    );
}

// ─── Tier badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier, tag }: { tier: string; tag: string }) {
    const colorMap: Record<string, string> = {
        Authority:    "border-amber-500/30   bg-amber-500/10   text-amber-300",
        Expert:       "border-[#a7c8b3]/30   bg-[#a7c8b3]/10   text-[#a7c8b3]",
        Practitioner: "border-blue-500/30    bg-blue-500/10    text-blue-300",
        Apprentice:   "border-purple-500/30  bg-purple-500/10  text-purple-300",
        Newcomer:     "border-zinc-500/30    bg-zinc-500/10    text-zinc-400",
    };

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                colorMap[tier] ?? colorMap.Newcomer
            )}
        >
            {tier} in {tag}
        </span>
    );
}

// ─── Single gap row ───────────────────────────────────────────────────────────

function GapRow({ gap }: { gap: GapQuestion }) {
    const urgency = getUrgencyLevel(gap.hoursWaiting);

    const urgencyDot: Record<typeof urgency, string> = {
        normal:   "bg-zinc-600",
        elevated: "bg-amber-400/70",
        high:     "bg-amber-400",
    };

    const rowBorder: Record<typeof urgency, string> = {
        normal:   "border-white/[0.06]",
        elevated: "border-amber-500/10",
        high:     "border-amber-500/20",
    };

    const rowBg: Record<typeof urgency, string> = {
        normal:   "bg-white/[0.02]  hover:bg-white/[0.04]",
        elevated: "bg-amber-500/[0.03] hover:bg-amber-500/[0.06]",
        high:     "bg-amber-500/[0.05] hover:bg-amber-500/[0.08]",
    };

    return (
        // Step 8.2 — ?ref=gap-detector lets question-detail-page analytics
        // attribute this visit to the Answer Gap Detector widget. No new
        // tracking infrastructure required — just the query param.
        <Link
            href={`/questions/${gap.$id}/${slugify(gap.title)}?ref=gap-detector`}
            className={cn(
                "group flex flex-col gap-1.5 rounded-xl border p-3 transition-all duration-200",
                rowBorder[urgency],
                rowBg[urgency]
            )}
        >
            {/* Title */}
            <p className="line-clamp-1 text-xs font-medium leading-snug text-zinc-200 transition group-hover:text-white">
                {gap.title}
            </p>

            {/* Badge + meta */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <TierBadge tier={gap.userTierInMatchedTag} tag={gap.matchedTag} />

                <span className="flex items-center gap-1 text-[10px] text-zinc-500">
                    <span
                        className={cn(
                            "inline-block size-1.5 rounded-full",
                            urgencyDot[urgency]
                        )}
                        aria-hidden
                    />
                    <Clock className="size-2.5" aria-hidden />
                    {convertDateToRelativeTime(new Date(gap.$createdAt))}
                </span>

                <span className="ml-auto text-[10px] text-zinc-600 transition group-hover:text-zinc-400">
                    by {gap.authorName}
                </span>
            </div>
        </Link>
    );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center">
            <CheckCircle2 className="size-5 text-[#a7c8b3]" />
            <p className="text-xs font-medium text-zinc-300">
                All questions in your areas are answered
            </p>
            <p className="text-[11px] text-zinc-600">Check back soon for new opportunities.</p>
            <Link
                href="/questions?filter=Unanswered"
                className="mt-1 text-[11px] font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
            >
                Browse all unanswered →
            </Link>
        </div>
    );
}

// ─── No-skill-data state ──────────────────────────────────────────────────────

function NoSkillDataState() {
    return (
        <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center">
            <p className="text-xs font-medium text-zinc-300">Build your skill profile first</p>
            <p className="text-[11px] leading-relaxed text-zinc-600">
                Answer a few questions to see personalized gaps matched to your expertise.
            </p>
            <Link
                href="/questions?filter=Unanswered"
                className="mt-1 text-[11px] font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
            >
                Find questions to answer →
            </Link>
        </div>
    );
}

// ─── Unauthenticated state ────────────────────────────────────────────────────

function UnauthenticatedState() {
    return (
        <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
            <LogIn className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-300">
                    See questions matched to your expertise
                </p>
                <Link
                    href="/login"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
                >
                    Sign in to get started
                    <ChevronRight className="size-3" />
                </Link>
            </div>
        </div>
    );
}

// ─── Phase 8 — Step 8.3: Error fallback ───────────────────────────────────────
// Rendered by the ErrorBoundary wrapping this widget at its call site
// (see HomeClient.tsx). Matches the widget's own card chrome so a render
// failure never breaks the sidebar's visual rhythm.

export function AnswerGapDetectorFallback() {
    return (
        <div className="mb-4 rounded-2xl border border-white/5 bg-white/[0.025] p-4">
            <div className="mb-3 flex items-center gap-2">
                <Zap className="size-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Answer Gap Detector</h3>
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
                We couldn&apos;t load your personalized question gaps right now. The rest of
                ByteNest is unaffected — try refreshing the page.
            </p>
        </div>
    );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function AnswerGapDetector() {
    const { session } = useAuthStore();
    const [state, setState] = React.useState<WidgetState>({ status: "loading" });

    React.useEffect(() => {
        if (!session) {
            setState({ status: "unauthenticated" });
            return;
        }

        let cancelled = false;

        apiFetch<ApiResponse>("/api/answer-gaps")
            .then((response) => {
                if (cancelled) return;

                if (response.meta?.reason === "no_skill_data") {
                    setState({ status: "no_skill_data" });
                    return;
                }

                if (response.meta?.reason === "no_gaps" || (Array.isArray(response.data) && response.data.length === 0)) {
                    setState({ status: "empty" });
                    return;
                }

                setState({ status: "loaded", gaps: response.data });
            })
            .catch(() => {
                if (!cancelled) setState({ status: "empty" });
            });

        return () => {
            cancelled = true;
        };
    }, [session]);

    return (
        <div className="mb-4 rounded-2xl border border-white/5 bg-white/[0.025] p-4">
            {/* Header */}
            <div className="mb-3 flex items-center gap-2">
                <Zap className="size-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Answer Gap Detector</h3>
            </div>

            {/* Body */}
            {state.status === "loading" && <GapSkeleton />}

            {state.status === "unauthenticated" && <UnauthenticatedState />}

            {state.status === "no_skill_data" && <NoSkillDataState />}

            {state.status === "empty" && <EmptyState />}

            {state.status === "loaded" && (
                <>
                    <p className="mb-3 text-[11px] text-zinc-500">
                        Questions in your skill areas waiting for answers
                    </p>
                    <div className="space-y-2">
                        {state.gaps.map((gap) => (
                            <GapRow key={gap.$id} gap={gap} />
                        ))}
                    </div>
                    <Link
                        href="/questions?filter=Unanswered"
                        className="mt-3 flex items-center gap-1 text-[11px] font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
                    >
                        Browse all unanswered
                        <ChevronRight className="size-3" />
                    </Link>
                </>
            )}
        </div>
    );
}
