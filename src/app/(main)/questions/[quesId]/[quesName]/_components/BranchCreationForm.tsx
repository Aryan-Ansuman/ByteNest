"use client";

import React from "react";
import dynamic from "next/dynamic";
import { GitBranch, Loader2 } from "lucide-react";
import { useQuestionDetail } from "./QuestionDetailContext";
import "@uiw/react-md-editor/markdown-editor.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

const CONDITION_MAX = 200;
const LABEL_MAX = 100;

export default function BranchCreationForm({
    parentAnswerId,
    onDone,
}: {
    parentAnswerId: string;
    onDone: () => void;
}) {
    const { submitAnswer, isDeletingQuestion } = useQuestionDetail();

    const [condition, setCondition] = React.useState("");
    const [branchLabel, setBranchLabel] = React.useState("");
    const [labelTouched, setLabelTouched] = React.useState(false);
    const [content, setContent] = React.useState("");
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const disabled = isSubmitting || isDeletingQuestion;
    const conditionValid = condition.trim().length > 0;
    const contentValid = content.trim().length >= 10;
    const canSubmit = conditionValid && contentValid && !disabled;

    const handleLabelBlur = () => {
        setLabelTouched(true);
        if (!branchLabel.trim() && condition.trim()) {
            setBranchLabel(condition.trim().slice(0, LABEL_MAX));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;

        setIsSubmitting(true);
        const posted = await submitAnswer(content, undefined, {
            parentAnswerId,
            condition: condition.trim(),
            branchLabel: branchLabel.trim() || condition.trim().slice(0, LABEL_MAX),
        });
        setIsSubmitting(false);

        if (posted) {
            setCondition("");
            setBranchLabel("");
            setLabelTouched(false);
            setContent("");
            onDone();
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            aria-busy={isSubmitting}
            className="mt-3 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3]/[0.03] p-4"
        >
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-[#a7c8b3]">
                <GitBranch className="size-3.5" />
                New branch
            </div>

            <div className="space-y-3">
                <div>
                    <label
                        htmlFor={`branch-condition-${parentAnswerId}`}
                        className="mb-1.5 block text-xs font-medium text-zinc-400"
                    >
                        This branch applies when…
                    </label>
                    <input
                        id={`branch-condition-${parentAnswerId}`}
                        type="text"
                        value={condition}
                        onChange={(e) => setCondition(e.target.value.slice(0, CONDITION_MAX))}
                        placeholder="e.g. using CommonJS, on Windows, React < 18"
                        maxLength={CONDITION_MAX}
                        disabled={disabled}
                        required
                        className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition focus:border-[#a7c8b3]/40 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <div className="mt-1 text-right text-[11px] text-zinc-600">
                        {condition.length}/{CONDITION_MAX}
                    </div>
                </div>

                <div>
                    <label
                        htmlFor={`branch-label-${parentAnswerId}`}
                        className="mb-1.5 block text-xs font-medium text-zinc-400"
                    >
                        Short label (shown in navigator)
                    </label>
                    <input
                        id={`branch-label-${parentAnswerId}`}
                        type="text"
                        value={branchLabel}
                        onChange={(e) => setBranchLabel(e.target.value.slice(0, LABEL_MAX))}
                        onBlur={handleLabelBlur}
                        placeholder="e.g. CommonJS"
                        maxLength={LABEL_MAX}
                        disabled={disabled}
                        className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none transition focus:border-[#a7c8b3]/40 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    {!labelTouched && (
                        <p className="mt-1 text-[11px] text-zinc-600">
                            Left blank, this fills in from the condition above.
                        </p>
                    )}
                </div>

                <div>
                    <label className="mb-1.5 block text-xs font-medium text-zinc-400">Branch answer</label>
                    <div data-color-mode="dark">
                        <MDEditor
                            value={content}
                            onChange={(value) => setContent(value || "")}
                            height={220}
                            preview="live"
                            style={{
                                background: "transparent",
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: "12px",
                                overflow: "hidden",
                            }}
                            textareaProps={{
                                placeholder: "Write the answer for this specific case... Markdown supported.",
                                disabled,
                            }}
                        />
                    </div>
                </div>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
                <button
                    type="button"
                    onClick={onDone}
                    disabled={disabled}
                    className="h-9 rounded-xl border border-white/[0.08] px-3.5 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={!canSubmit}
                    className="flex h-9 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-3.5 text-sm font-semibold text-[#08100B] transition hover:bg-[#b9d8c4] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <GitBranch className="size-3.5" />}
                    {isSubmitting ? "Posting…" : "Post branch"}
                </button>
            </div>
        </form>
    );
}
