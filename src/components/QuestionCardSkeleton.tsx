"use client";

import React from "react";
import { motion } from "framer-motion";

export function QuestionCardSkeleton({ index = 0 }: { index?: number }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
            className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] p-5"
        >
            <div className="flex gap-4">
                <div className="flex shrink-0 flex-col items-center gap-2 pt-0.5">
                    <div className="size-7 animate-pulse rounded-lg bg-white/[0.06]" />
                    <div className="h-4 w-5 animate-pulse rounded bg-white/[0.06]" />
                    <div className="size-7 animate-pulse rounded-lg bg-white/[0.06]" />
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.08]" />
                    <div className="h-3 w-full animate-pulse rounded bg-white/[0.05]" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.05]" />
                    <div className="flex gap-1.5 pt-1">
                        <div className="h-5 w-14 animate-pulse rounded-full bg-white/[0.06]" />
                        <div className="h-5 w-16 animate-pulse rounded-full bg-white/[0.06]" />
                        <div className="h-5 w-12 animate-pulse rounded-full bg-white/[0.06]" />
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

export default function QuestionListSkeleton({ count = 5 }: { count?: number }) {
    return (
        <div className="space-y-3" role="status" aria-label="Loading questions">
            {Array.from({ length: count }, (_, i) => (
                <QuestionCardSkeleton key={i} index={i} />
            ))}
            <span className="sr-only">Loading questions…</span>
        </div>
    );
}
