"use client";

import React from "react";
import { GitMerge, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPrDiffReadOnly, prReadOnlyReason, type PrReadOnlyQuestion } from "@/lib/pr-questions/readOnly";

export default function PrStatusBanner({ question }: { question: PrReadOnlyQuestion }) {
    if (!isPrDiffReadOnly(question)) return null;

    const reason = prReadOnlyReason(question);
    const merged = question.prStatus === "merged";

    return (
        <div
            className={cn(
                "flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm",
                merged
                    ? "border-[#B794F6]/30 bg-[#B794F6]/10 text-[#D6BCFA]"
                    : "border-[#F87171]/30 bg-[#F87171]/10 text-[#FCA5A5]"
            )}
        >
            {merged ? <GitMerge className="size-4 shrink-0" /> : <Lock className="size-4 shrink-0" />}
            <span>{reason}</span>
        </div>
    );
}
