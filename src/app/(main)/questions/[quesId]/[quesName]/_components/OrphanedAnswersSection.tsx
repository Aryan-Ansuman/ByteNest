"use client";

import React from "react";
import { FileWarning } from "lucide-react";
import AnswerCard from "./AnswerCard";
import { parseDiffLineRef } from "@/lib/pr-questions/diffOrphan";
import type { AnswerDoc } from "./QuestionDetailContext";

/**
 * Renders answers whose diffLineRef pointed at a line that no longer exists
 * after a diff refresh (see lib/pr-questions/diffOrphan.ts for the
 * anchored/orphaned/general split). Not deleted, not hidden — just moved
 * here, same approach GitHub uses for comments on outdated diffs.
 */
export default function OrphanedAnswersSection({ answers }: { answers: AnswerDoc[] }) {
    if (answers.length === 0) return null;

    return (
        <details className="group mt-6 border-t border-white/10 pt-4">
            <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-medium text-white/60 transition hover:text-white/80">
                <FileWarning className="size-4" />
                Show {answers.length} orphaned answer{answers.length !== 1 && 's'} (diff changed)
            </summary>
            <div className="mt-3">
                <p className="mb-4 text-xs text-white/40">
                    These answers were anchored to lines that no longer exist in the current diff.
                    The original context each answer was responding to is preserved below.
                </p>
                <div className="flex flex-col gap-4">
                    {answers.map((answer) => {
                        const ref = parseDiffLineRef(answer.diffLineRef as string | null);
                        return (
                            <div key={answer.$id} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                {ref && (
                                    <div className="mb-2 text-xs text-white/40">
                                        Originally anchored to{" "}
                                        <span className="font-mono text-white/60">
                                            {ref.filePath}:{ref.lineNumber}
                                        </span>
                                        {answer.diffLineContext && (
                                            <pre className="mt-1 overflow-x-auto rounded bg-black/30 p-2 font-mono text-[11px] text-white/50">
                                                {answer.diffLineContext}
                                            </pre>
                                        )}
                                    </div>
                                )}
                                <AnswerCard answer={answer} />
                            </div>
                        );
                    })}
                </div>
            </div>
        </details>
    );
}
