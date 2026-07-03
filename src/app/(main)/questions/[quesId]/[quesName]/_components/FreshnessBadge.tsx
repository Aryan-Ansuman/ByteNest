"use client";

import React from "react";
import { Clock, AlertTriangle, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import type { AnswerDoc } from "./QuestionDetailContext";

interface Props {
    label: AnswerDoc["freshnessLabel"];
    lastFreshnessCheck?: string | null;
    techPackage?: string | null;
    versionMax?: string | null;
    latestVersion?: string | null;
    stalenessVoteCount?: number;
    ageMonthsFallback?: number | null;
}

/** Renders nothing for "fresh" — a green checkmark on every answer is noise, not signal. */
export default function FreshnessBadge({
    label,
    lastFreshnessCheck,
    techPackage,
    versionMax,
    latestVersion,
    stalenessVoteCount = 0,
    ageMonthsFallback,
}: Props) {
    if (!label || label === "fresh") return null;

    const tooltip = buildTooltip({ techPackage, versionMax, latestVersion, stalenessVoteCount });
    const lastVerifiedLabel = lastFreshnessCheck
        ? `Last verified ${convertDateToRelativeTime(new Date(lastFreshnessCheck))}`
        : typeof ageMonthsFallback === "number"
        ? "Not yet evaluated by the freshness check"
        : null;

    if (label === "aging") {
        return (
            <span className="inline-flex flex-col gap-0.5">
                <span
                    title={tooltip}
                    className="group inline-flex w-fit items-center gap-1 text-zinc-600 transition hover:text-zinc-400"
                >
                    <Clock className="size-3.5" />
                    <span className="hidden text-[11px] font-medium group-hover:inline">
                        {tooltip}
                    </span>
                </span>
                {lastVerifiedLabel && (
                    <span className="text-[11px] text-zinc-600">{lastVerifiedLabel}</span>
                )}
            </span>
        );
    }

    const isStale = label === "stale";

    return (
        <span className="inline-flex flex-col gap-1">
            <span
                title={tooltip}
                className={cn(
                    "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                    isStale
                        ? "border-red-500/20 bg-red-950/30 text-red-400"
                        : "border-amber-500/20 bg-amber-950/30 text-amber-400"
                )}
            >
                {isStale ? (
                    <OctagonAlert className="size-3" />
                ) : (
                    <AlertTriangle className="size-3" />
                )}
                {isStale ? "Likely outdated" : "May be outdated"}
            </span>
            {lastVerifiedLabel && (
                <span className="text-[11px] text-zinc-600">{lastVerifiedLabel}</span>
            )}
        </span>
    );
}

function buildTooltip({
    techPackage,
    versionMax,
    latestVersion,
    stalenessVoteCount,
}: {
    techPackage?: string | null;
    versionMax?: string | null;
    latestVersion?: string | null;
    stalenessVoteCount: number;
}): string {
    if (techPackage && versionMax && latestVersion) {
        return `Written for ${techPackage} ${versionMax}, current version is ${latestVersion}`;
    }
    if (stalenessVoteCount > 0) {
        return "Community reported as no longer working on newer versions";
    }
    if (techPackage) {
        return `Written for ${techPackage}${versionMax ? ` ${versionMax}` : ""} — may be behind the latest release`;
    }
    return "This answer's freshness has decayed with age";
}
