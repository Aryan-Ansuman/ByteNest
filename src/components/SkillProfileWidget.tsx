// src/components/SkillProfileWidget.tsx
// Phase 5 — Sidebar Widget UI

"use client";

import React from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, Minus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/Auth";
import { apiFetch } from "@/lib/api-fetch";
import slugify from "@/utils/slugify";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SkillSummaryItem {
    tag: string;
    compositeScore: number;
    tier: string;
    trendDirection: "up" | "stable" | "down";
    scoreSevenDaysAgo?: number;
}

interface SkillSummaryResponse {
    data: {
        userId: string;
        isOwner: boolean;
        skills: SkillSummaryItem[];
    };
}

type FetchState = "idle" | "loading" | "loaded" | "error";

// ─── Tier color system (Step 5.4) ─────────────────────────────────────────────
// Newcomer: muted zinc. Apprentice → Expert: sage-green at increasing opacity.
// Authority: full opacity plus an accent glow treatment.

const TIER_STYLES: Record<string, { badge: string; bar: string }> = {
    Newcomer: {
        badge: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
        bar: "bg-zinc-500/40",
    },
    Apprentice: {
        badge: "border-[#a7c8b3]/15 bg-[#a7c8b3]/[0.06] text-[#a7c8b3]/70",
        bar: "bg-[#a7c8b3]/35",
    },
    Practitioner: {
        badge: "border-[#a7c8b3]/25 bg-[#a7c8b3]/[0.12] text-[#a7c8b3]",
        bar: "bg-[#a7c8b3]/65",
    },
    Expert: {
        badge: "border-[#a7c8b3]/40 bg-[#a7c8b3]/20 text-[#a7c8b3] font-semibold",
        bar: "bg-[#a7c8b3]",
    },
    Authority: {
        badge:
            "border-[#a7c8b3]/50 bg-[#a7c8b3]/25 text-[#d3e7d8] font-semibold shadow-[0_0_12px_rgba(167,200,179,0.35)]",
        bar: "bg-[#a7c8b3] shadow-[0_0_8px_rgba(167,200,179,0.5)]",
    },
};

function getTierStyles(tier: string) {
    return TIER_STYLES[tier] ?? TIER_STYLES.Newcomer;
}

// ─── Trend helper (Step 5.3) ──────────────────────────────────────────────────
// Trend is derived by comparing the current composite score against
// scoreSevenDaysAgo stored on the skill document, not the server's
// short-horizon trendDirection (which reflects the most recent recalculation).

const TREND_THRESHOLD = 2;

function getTrend(skill: SkillSummaryItem): "up" | "stable" | "down" {
    if (typeof skill.scoreSevenDaysAgo !== "number") return skill.trendDirection;
    const delta = skill.compositeScore - skill.scoreSevenDaysAgo;
    if (delta >= TREND_THRESHOLD) return "up";
    if (delta <= -TREND_THRESHOLD) return "down";
    return "stable";
}

function TrendIcon({ trend }: { trend: "up" | "stable" | "down" }) {
    if (trend === "up") return <ArrowUp className="size-3 text-[#a7c8b3]" />;
    if (trend === "down") return <ArrowDown className="size-3 text-red-400" />;
    return <Minus className="size-3 text-zinc-600" />;
}

// ─── SkillBar ─────────────────────────────────────────────────────────────────

function SkillBar({ skill }: { skill: SkillSummaryItem }) {
    const styles = getTierStyles(skill.tier);
    const trend = getTrend(skill);
    const score = Math.max(0, Math.min(100, skill.compositeScore));

    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-medium text-zinc-300">
                        {skill.tag}
                    </span>
                    <span
                        className={cn(
                            "shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                            styles.badge
                        )}
                    >
                        {skill.tier}
                    </span>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-[11px] text-zinc-500">
                    <TrendIcon trend={trend} />
                    <span className="tabular-nums">{score.toFixed(0)}</span>
                </div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                    className={cn("h-full rounded-full transition-all duration-500", styles.bar)}
                    style={{ width: `${score}%` }}
                />
            </div>
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function SkillProfileSkeleton() {
    return (
        <div className="space-y-3" role="status" aria-label="Loading skill profile">
            {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <div className="h-3 w-20 animate-pulse rounded bg-white/[0.07]" />
                        <div className="h-3 w-8 animate-pulse rounded bg-white/[0.05]" />
                    </div>
                    <div className="h-1.5 w-full animate-pulse rounded-full bg-white/[0.05]" />
                </div>
            ))}
            <span className="sr-only">Loading skill profile…</span>
        </div>
    );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function SkillProfileWidget() {
    const { session, user } = useAuthStore();
    const [state, setState] = React.useState<FetchState>("idle");
    const [skills, setSkills] = React.useState<SkillSummaryItem[]>([]);

    React.useEffect(() => {
        if (!session || !user) {
            setState("idle");
            setSkills([]);
            return;
        }

        let cancelled = false;
        setState("loading");

        apiFetch<SkillSummaryResponse>(`/api/user/${user.$id}/skills/summary`)
            .then((response) => {
                if (cancelled) return;
                setSkills(response.data.skills ?? []);
                setState("loaded");
            })
            .catch(() => {
                if (cancelled) return;
                setState("error");
            });

        return () => {
            cancelled = true;
        };
    }, [session, user]);

    const profileHref = user ? `/users/${user.$id}/${slugify(user.name)}#skills` : "#";

    return (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="mb-4 flex items-center gap-2">
                <Sparkles className="size-4 text-[#a7c8b3]" />
                <h3 className="text-sm font-semibold text-zinc-100">Skill Profile</h3>
            </div>

            {/* ── State 1: Unauthenticated ── */}
            {!session || !user ? (
                <p className="text-xs leading-relaxed text-zinc-500">
                    <Link
                        href="/login"
                        className="font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
                    >
                        Sign in
                    </Link>{" "}
                    to see your skill profile.
                </p>
            ) : state === "loading" || state === "idle" ? (
                <SkillProfileSkeleton />
            ) : state === "error" ? (
                <p className="text-xs text-zinc-500">
                    Couldn&apos;t load your skill profile right now.
                </p>
            ) : skills.length === 0 ? (
                /* ── State 2: Authenticated, no data yet ── */
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-xs font-medium text-zinc-300">
                        Your skill profile is just getting started
                    </p>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                        Answer questions, earn upvotes, and get answers accepted to start
                        building expertise scores across the tags you contribute to.
                    </p>
                    <Link
                        href="/questions?filter=Unanswered"
                        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
                    >
                        Find a question to answer
                        <ChevronRight className="size-3" />
                    </Link>
                </div>
            ) : (
                /* ── State 3: Authenticated, has data ── */
                <div className="space-y-4">
                    {skills.map((skill) => (
                        <SkillBar key={skill.tag} skill={skill} />
                    ))}
                </div>
            )}

            {session && user && (
                <Link
                    href={profileHref}
                    className="mt-4 flex items-center gap-1 text-xs font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
                >
                    View full profile
                    <ChevronRight className="size-3.5" />
                </Link>
            )}
        </div>
    );
}
