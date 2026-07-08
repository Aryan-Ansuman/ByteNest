"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Loader2, Send, X } from "lucide-react";
import { useQuestionDetail } from "./QuestionDetailContext";
import "@uiw/react-md-editor/markdown-editor.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

interface PrLineAnswerFormProps {
    filePath: string;
    lineNumber: number;
    side: "left" | "right";
    /** The actual line content at the anchor — stored verbatim as diffLineContext (Phase 0, Decision 3). */
    lineContent: string;
    onDone: () => void;
}

// Same position GitHub puts its own review-comment box: directly below the
// clicked line, injected as a react-diff-view widget (see PrDiffViewer).
export default function PrLineAnswerForm({
    filePath,
    lineNumber,
    side,
    lineContent,
    onDone,
}: PrLineAnswerFormProps) {
    const { currentUser, submitLineAnswer, isDeletingQuestion } = useQuestionDetail();
    const [draft, setDraft] = React.useState("");
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isDeletingQuestion || !draft.trim()) return;
        setIsSubmitting(true);
        const posted = await submitLineAnswer(
            draft,
            { filePath, lineNumber, side },
            lineContent
        );
        setIsSubmitting(false);
        if (posted) {
            setDraft("");
            onDone();
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            className="my-2 rounded-xl border border-[#CFE8D5]/20 bg-black/40 p-3"
            aria-busy={isSubmitting}
        >
            <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-zinc-500">
                    Replying to{" "}
                    <span className="font-mono text-zinc-400">
                        {filePath}:{lineNumber}
                    </span>{" "}
                    as {currentUser?.name ?? "you"}
                </p>
                <button
                    type="button"
                    onClick={onDone}
                    className="text-zinc-500 transition hover:text-zinc-200"
                    aria-label="Cancel"
                >
                    <X className="size-4" />
                </button>
            </div>
            <div data-color-mode="dark">
                <MDEditor
                    value={draft}
                    onChange={(value) => setDraft(value || "")}
                    height={160}
                    preview="live"
                    style={{
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "10px",
                        overflow: "hidden",
                    }}
                    textareaProps={{
                        placeholder: "Answer this specific line... Markdown supported.",
                        disabled: isSubmitting || isDeletingQuestion,
                    }}
                />
            </div>
            <div className="mt-2.5 flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={onDone}
                    disabled={isSubmitting}
                    className="h-8 rounded-lg border border-white/[0.08] px-3 text-xs text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting || isDeletingQuestion || !draft.trim()}
                    className="flex h-8 items-center gap-1.5 rounded-lg border border-[#CFE8D5]/20 bg-[#CFE8D5] px-3 text-xs font-semibold text-[#08100B] transition hover:bg-[#ddf3e2] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isSubmitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                    {isSubmitting ? "Posting..." : "Post answer"}
                </button>
            </div>
        </form>
    );
}
