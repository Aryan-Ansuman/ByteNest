"use client";

import React from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";
import type { PrStatus } from "@/lib/pr-questions/readOnly";

const COOLDOWN_MS = 60_000;

interface RefreshResult {
    questionId: string;
    prStatus: PrStatus;
    prMergedAt: string | null;
    prClosedAt: string | null;
}

export default function RefreshStatusButton({
    questionId,
    onRefreshed,
}: {
    questionId: string;
    onRefreshed: (result: RefreshResult) => void;
}) {
    const [submitting, setSubmitting] = React.useState(false);
    const [cooldownUntil, setCooldownUntil] = React.useState<number | null>(null);
    const [, forceTick] = React.useState(0);

    React.useEffect(() => {
        if (!cooldownUntil) return;
        const id = setInterval(() => forceTick((n) => n + 1), 1000);
        return () => clearInterval(id);
    }, [cooldownUntil]);

    const onCooldown = cooldownUntil !== null && Date.now() < cooldownUntil;
    const secondsLeft = onCooldown ? Math.ceil((cooldownUntil! - Date.now()) / 1000) : 0;

    async function handleRefresh() {
        if (submitting || onCooldown) return;
        setSubmitting(true);
        try {
            const res = await apiFetch<{ data: RefreshResult }>(
                `/api/pr-question/refresh?questionId=${questionId}`,
                { method: "POST" }
            );
            onRefreshed(res.data);
            setCooldownUntil(Date.now() + COOLDOWN_MS);
            toast.success("PR status refreshed");
        } catch (error: any) {
            toast.error(error?.message ?? "Couldn't refresh PR status");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <button
            onClick={handleRefresh}
            disabled={submitting || onCooldown}
            title="Re-fetch PR status from GitHub"
            className={cn(
                "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            )}
        >
            <RefreshCw className={cn("size-3", submitting && "animate-spin")} />
            {submitting ? "Refreshing…" : onCooldown ? `Refresh (${secondsLeft}s)` : "Refresh Status"}
        </button>
    );
}
