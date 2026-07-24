"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/Auth";
import { AdrDimension, AdrExpertiseLevel } from "@/models/name";
import { useSWRConfig } from "swr";
import { apiFetch } from "@/lib/api-fetch";

interface Props {
    questionId: string;
    optionA: string;
    optionB: string;
    dimensions: AdrDimension[];
    existingSubmission?: {
        submissionId: string;
        optionAScores: Record<string, number>;
        optionBScores: Record<string, number>;
        expertise: AdrExpertiseLevel;
        reasoning: string | null;
    } | null;
}

export default function AdrScoreForm({ questionId, optionA, optionB, dimensions, existingSubmission }: Props) {
    const { user: currentUser } = useAuthStore();
    const { mutate } = useSWRConfig();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [scoresA, setScoresA] = useState<Record<string, number>>(
        existingSubmission?.optionAScores || dimensions.reduce((acc, dim) => ({ ...acc, [dim]: 3 }), {})
    );
    const [scoresB, setScoresB] = useState<Record<string, number>>(
        existingSubmission?.optionBScores || dimensions.reduce((acc, dim) => ({ ...acc, [dim]: 3 }), {})
    );
    const [expertise, setExpertise] = useState<AdrExpertiseLevel>(
        existingSubmission?.expertise || "intermediate"
    );
    const [reasoning, setReasoning] = useState(existingSubmission?.reasoning || "");

    if (!currentUser) {
        return (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-6 text-center text-zinc-400">
                Please log in to submit your scores.
            </div>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const method = existingSubmission ? "PATCH" : "POST";
        const payload = {
            ...(existingSubmission ? { submissionId: existingSubmission.submissionId } : { questionId }),
            optionAScores: JSON.stringify(scoresA),
            optionBScores: JSON.stringify(scoresB),
            expertise,
            reasoning,
        };

        try {
            await apiFetch("/api/adr", {
                method,
                body: JSON.stringify(payload),
            });

            toast.success(existingSubmission ? "Scores updated successfully!" : "Scores submitted successfully!");
            // Revalidate SWR data for the radar chart
            mutate(`/api/adr?questionId=${questionId}&limit=100`);
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleScoreChange = (option: "A" | "B", dim: string, value: number) => {
        if (option === "A") {
            setScoresA((prev) => ({ ...prev, [dim]: value }));
        } else {
            setScoresB((prev) => ({ ...prev, [dim]: value }));
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-white/[0.08] bg-white/[0.02] p-5 sm:p-6">
            <h3 className="text-lg font-semibold text-zinc-200">
                {existingSubmission ? "Update your scores" : "Submit your scores"}
            </h3>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Option A Scores */}
                <div className="space-y-4">
                    <h4 className="font-medium text-[#CFE8D5]">{optionA}</h4>
                    {dimensions.map((dim) => (
                        <div key={`A-${dim}`} className="space-y-1.5">
                            <div className="flex justify-between text-xs text-zinc-400">
                                <span className="capitalize">{dim.replace(/_/g, " ")}</span>
                                <span>{scoresA[dim]}</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="5"
                                step="1"
                                value={scoresA[dim]}
                                onChange={(e) => handleScoreChange("A", dim, parseInt(e.target.value))}
                                className="w-full accent-[#CFE8D5]"
                            />
                        </div>
                    ))}
                </div>

                {/* Option B Scores */}
                <div className="space-y-4">
                    <h4 className="font-medium text-[#D5CFE8]">{optionB}</h4>
                    {dimensions.map((dim) => (
                        <div key={`B-${dim}`} className="space-y-1.5">
                            <div className="flex justify-between text-xs text-zinc-400">
                                <span className="capitalize">{dim.replace(/_/g, " ")}</span>
                                <span>{scoresB[dim]}</span>
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="5"
                                step="1"
                                value={scoresB[dim]}
                                onChange={(e) => handleScoreChange("B", dim, parseInt(e.target.value))}
                                className="w-full accent-[#D5CFE8]"
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-white/[0.08]">
                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300">Your Expertise Level</label>
                    <select
                        value={expertise}
                        onChange={(e) => setExpertise(e.target.value as AdrExpertiseLevel)}
                        className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] p-2.5 text-sm text-zinc-200 focus:border-[#CFE8D5] focus:outline-none focus:ring-1 focus:ring-[#CFE8D5]"
                    >
                        <option value="novice">Novice (1.0x Weight)</option>
                        <option value="intermediate">Intermediate (1.5x Weight)</option>
                        <option value="expert">Expert (2.0x Weight)</option>
                    </select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-medium text-zinc-300">Reasoning (Optional)</label>
                    <textarea
                        value={reasoning}
                        onChange={(e) => setReasoning(e.target.value)}
                        placeholder="Briefly explain your scores..."
                        className="min-h-[80px] w-full resize-y rounded-lg border border-white/[0.1] bg-white/[0.03] p-3 text-sm text-zinc-200 placeholder-zinc-500 focus:border-[#CFE8D5] focus:outline-none focus:ring-1 focus:ring-[#CFE8D5]"
                        maxLength={1000}
                    />
                </div>
            </div>

            <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#CFE8D5] px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-[#a7c8b3] disabled:opacity-50"
            >
                {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                {existingSubmission ? "Update Scores" : "Submit Scores"}
            </button>
        </form>
    );
}
