"use client";

import React from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Minus, LogIn, Flame } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { useAuthStore } from "@/store/Auth";
import { cn } from "@/lib/utils";
import { TRAJECTORY_DISPLAY } from "@/lib/reputation-trajectory-hardening";

// ─── Types (mirrors the API response shape from Phase 5) ──────────────────────

interface WeeklyBucket {
    weekLabel: string;
    delta: number;
    displayDelta: number;
    isCapped: boolean;
}

interface TrajectoryData {
    currentReputation: number;
    trajectory: "Climbing" | "Stable" | "Declining";
    velocity: number;           // avg weekly gain, trailing 4 complete weeks
    projection30d: number | null;
    streakWeeks: number;
    weeklyBuckets: WeeklyBucket[]; // 8 items, oldest → newest
    noData: boolean;
    hasEnoughDataForProjection: boolean;
}

type WidgetState =
    | { status: "loading" }
    | { status: "unauthenticated" }
    | { status: "no_data" }
    | { status: "error" }
    | { status: "loaded"; data: TrajectoryData };

// ─── Sparkline ────────────────────────────────────────────────────────────────
// Pure SVG — no charting library needed for 8 points.

const SPARKLINE_W = 200;
const SPARKLINE_H = 40;

function Sparkline({ buckets, trajectory }: { buckets: WeeklyBucket[]; trajectory: TrajectoryData["trajectory"] }) {
    if (buckets.length === 0) return null;

    // Use pre-capped displayDelta from Step 9.2
    const deltas = buckets.map((b) => b.displayDelta);

    const minVal = Math.min(0, ...deltas); // always include 0 so flat weeks are visible
    const maxVal = Math.max(0, ...deltas);
    const range  = maxVal - minVal || 1;   // guard zero-range

    const toY = (v: number) =>
        SPARKLINE_H - ((v - minVal) / range) * SPARKLINE_H;

    const toX = (i: number) =>
        deltas.length === 1
            ? SPARKLINE_W / 2
            : (i / (deltas.length - 1)) * SPARKLINE_W;

    // Build SVG path
    const points = deltas.map((d, i) => `${toX(i)},${toY(d)}`);
    const d = `M ${points.join(" L ")}`;

    // Zero-line y position
    const zeroY = toY(0);

    const strokeColor: Record<TrajectoryData["trajectory"], string> = {
        Climbing: "#a7c8b3",
        Stable:   "#71717a",
        Declining:"#f59e0b",
    };

    const fillId = `sparkfill-${trajectory}`;

    return (
        <svg
            viewBox={`0 0 ${SPARKLINE_W} ${SPARKLINE_H}`}
            width="100%"
            height={SPARKLINE_H}
            aria-hidden="true"
            className="overflow-visible"
        >
            <defs>
                <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={strokeColor[trajectory]} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={strokeColor[trajectory]} stopOpacity="0"    />
                </linearGradient>
            </defs>

            {/* Zero reference line */}
            <line
                x1={0} y1={zeroY}
                x2={SPARKLINE_W} y2={zeroY}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
                strokeDasharray="3 3"
            />

            {/* Fill area under the line */}
            <path
                d={`${d} L ${toX(deltas.length - 1)},${zeroY} L ${toX(0)},${zeroY} Z`}
                fill={`url(#${fillId})`}
            />

            {/* The line itself */}
            <path
                d={d}
                fill="none"
                stroke={strokeColor[trajectory]}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
            />

            {/* Terminal dot — most recent week */}
            <circle
                cx={toX(deltas.length - 1)}
                cy={toY(deltas[deltas.length - 1])}
                r={2.5}
                fill={strokeColor[trajectory]}
            >
                {buckets[buckets.length - 1]?.isCapped && (
                    <title>Spike capped for rendering. True delta: {buckets[buckets.length - 1].delta}</title>
                )}
            </circle>

            {/* Invisible hover targets for all points to show tooltip if capped */}
            {buckets.map((b, i) => (
                <circle
                    key={i}
                    cx={toX(i)}
                    cy={toY(deltas[i])}
                    r={6}
                    fill="transparent"
                >
                    {b.isCapped && (
                        <title>Spike capped for rendering. True delta: {b.delta}</title>
                    )}
                </circle>
            ))}
        </svg>
    );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function TrajectorySkeletion() {
    return (
        <div className="space-y-3" role="status" aria-label="Loading reputation trajectory">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="h-4 w-20 animate-pulse rounded bg-white/[0.07]" />
                <div className="h-5 w-14 animate-pulse rounded bg-white/[0.05]" />
            </div>
            {/* Sparkline placeholder */}
            <div className="h-10 animate-pulse rounded-lg bg-white/[0.04]" />
            {/* Projection row */}
            <div className="flex items-end justify-between">
                <div className="space-y-1.5">
                    <div className="h-3 w-24 animate-pulse rounded bg-white/[0.05]" />
                    <div className="h-5 w-16 animate-pulse rounded bg-white/[0.07]" />
                </div>
                <div className="h-4 w-20 animate-pulse rounded-full bg-white/[0.04]" />
            </div>
            <span className="sr-only">Loading reputation trajectory…</span>
        </div>
    );
}

// ─── Unauthenticated state ────────────────────────────────────────────────────

function UnauthenticatedState() {
    return (
        <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
            <LogIn className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-300">Track your reputation growth</p>
                <Link
                    href="/login"
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
                >
                    Sign in to see your trajectory →
                </Link>
            </div>
        </div>
    );
}

// ─── No-data state ────────────────────────────────────────────────────────────

function NoDataState() {
    return (
        <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center">
            <p className="text-xs font-medium text-zinc-300">No trajectory data yet</p>
            <p className="text-[11px] leading-relaxed text-zinc-600">
                Your reputation trajectory will appear here after your first contribution since launch.
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

// ─── Loaded widget body ───────────────────────────────────────────────────────

function TrajectoryBody({ data, userId, userName }: { data: TrajectoryData; userId: string; userName: string }) {
    const cfg = TRAJECTORY_DISPLAY[data.trajectory];
    
    // Map colors to Lucide icons
    let IconComponent = Minus;
    if (cfg.arrowDirection === "up") IconComponent = TrendingUp;
    if (cfg.arrowDirection === "down") IconComponent = TrendingDown;

    // Use tailwind classes matching the configured color
    const badgeBg = cfg.color === "text-emerald-400" ? "bg-emerald-400/10 border-emerald-400/20" :
                    cfg.color === "text-amber-400" ? "bg-amber-400/10 border-amber-400/20" :
                    "bg-zinc-500/10 border-zinc-500/20";

    const velocitySign  = data.velocity >= 0 ? "+" : "";
    const velocityLabel = `${velocitySign}${Math.round(data.velocity)} / week`;

    return (
        <div className="space-y-3">
            {/* ── Step 7.3 — Header ── */}
            <div className="flex items-center justify-between gap-2">
                {/* Trajectory badge */}
                <span
                    title={cfg.sublabel}
                    className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        badgeBg,
                        cfg.color
                    )}
                >
                    <IconComponent className="size-3.5" />
                    {cfg.label}
                </span>

                {/* Current reputation */}
                <span className="text-sm font-bold text-zinc-100">
                    {data.currentReputation.toLocaleString()}
                    <span className="ml-1 text-[10px] font-normal text-zinc-500">rep</span>
                </span>
            </div>

            {/* ── Step 7.2 — Sparkline ── */}
            <div className="py-0.5">
                <Sparkline buckets={data.weeklyBuckets} trajectory={data.trajectory} />
                <div className="mt-1 flex justify-between text-[9px] text-zinc-700">
                    <span>{data.weeklyBuckets[0]?.weekLabel ?? ""}</span>
                    <span>now</span>
                </div>
            </div>

            {/* ── Step 7.4 — Projection ── */}
            <div className="flex items-end justify-between gap-2">
                <div>
                    <p className="text-[10px] text-zinc-600">At current pace</p>
                    {data.hasEnoughDataForProjection && data.projection30d !== null ? (
                        <p className="text-lg font-bold leading-none text-zinc-100">
                            {data.projection30d.toLocaleString()}
                            <span className="ml-1 text-[10px] font-normal text-zinc-500">in 30 days</span>
                        </p>
                    ) : (
                        <p className="text-[11px] text-zinc-600 italic">Not enough data for projection</p>
                    )}
                    {data.hasEnoughDataForProjection && (
                        <p className="mt-0.5 text-[10px] text-zinc-600">{velocityLabel}</p>
                    )}
                </div>

                {/* ── Step 7.5 — Streak pill ── */}
                {data.streakWeeks >= 2 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-2 py-0.5 text-[10px] font-semibold text-[#a7c8b3]">
                        <Flame className="size-3" />
                        {data.streakWeeks}w streak
                    </span>
                )}
            </div>

            {/* Full history link */}
            <Link
                href={`/users/${userId}/${encodeURIComponent(userName.toLowerCase().replace(/\s+/g, "-"))}?ref=reputation-trajectory`}
                className="mt-1 block text-[11px] font-medium text-zinc-600 transition hover:text-zinc-400"
            >
                View full history →
            </Link>
        </div>
    );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function ReputationTrajectory() {
    const { session, user } = useAuthStore();
    const [state, setState] = React.useState<WidgetState>({ status: "loading" });

    React.useEffect(() => {
        if (!session) {
            setState({ status: "unauthenticated" });
            return;
        }

        let cancelled = false;

        apiFetch<TrajectoryData>("/api/user/reputation-trajectory")
            .then((res) => {
                if (cancelled) return;
                if (res.noData) {
                    setState({ status: "no_data" });
                    return;
                }
                setState({ status: "loaded", data: res });
            })
            .catch(() => {
                if (!cancelled) setState({ status: "error" });
            });

        return () => { cancelled = true; };
    }, [session]);

    // Step 7.6 — silent fallback on error
    if (state.status === "error") return null;

    return (
        <div className="mb-4 rounded-2xl border border-white/5 bg-white/[0.025] p-4">
            {/* Widget header */}
            <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="size-4 text-[#a7c8b3]" />
                <h3 className="text-sm font-semibold text-zinc-100">Reputation Trajectory</h3>
            </div>

            {state.status === "loading"        && <TrajectorySkeletion />}
            {state.status === "unauthenticated" && <UnauthenticatedState />}
            {state.status === "no_data"         && <NoDataState />}
            {state.status === "loaded"          && (
                <TrajectoryBody
                    data={state.data}
                    userId={user?.$id ?? ""}
                    userName={user?.name ?? ""}
                />
            )}
        </div>
    );
}
