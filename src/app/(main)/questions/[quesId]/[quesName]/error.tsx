"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";

interface ErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

export default function QuestionError({ error, reset }: ErrorProps) {
    React.useEffect(() => {
        console.error("[QuestionDetailError]", error);
    }, [error]);

    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
            <div className="mb-6 flex size-20 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
                <AlertTriangle className="size-9 text-red-400" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl">
                Something went wrong
            </h1>
            <p className="mt-3 max-w-md text-base text-zinc-400">
                We ran into a problem loading this question. This has been logged — please try again.
            </p>
            {error.digest && (
                <p className="mt-2 font-mono text-xs text-zinc-600">
                    Error ID: {error.digest}
                </p>
            )}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                    onClick={reset}
                    className="flex h-11 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-6 text-sm font-semibold text-[#08100b] transition hover:bg-[#b4d6bf]"
                >
                    <RefreshCw className="size-4" />
                    Try again
                </button>
                <Link
                    href="/questions"
                    className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                >
                    <ArrowLeft className="size-4" />
                    Back to questions
                </Link>
            </div>
        </div>
    );
}
