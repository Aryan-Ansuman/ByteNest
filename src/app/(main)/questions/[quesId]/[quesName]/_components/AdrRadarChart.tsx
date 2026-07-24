"use client";

import React, { useState } from "react";
import useSWR from "swr";
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Tooltip,
    Legend,
} from "recharts";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { aggregateAdrSubmissions, type AdrScoreSubmissionInput } from "@/lib/adr/aggregation";
import { AdrDimension } from "@/models/name";
import { labelForDimension } from "@/lib/adr/dimensionLabels";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Props {
    questionId: string;
    optionA: string;
    optionB: string;
    dimensions: AdrDimension[];
    mySubmission?: any;
    adrStatus?: "open" | "concluded" | null;
}

type ChartMode = "average" | "weighted" | "mine";

export default function AdrRadarChart({ questionId, optionA, optionB, dimensions, mySubmission, adrStatus }: Props) {
    const [mode, setMode] = useState<ChartMode>("average");
    const [tableOpen, setTableOpen] = useState(false);

    const { data, error, isLoading } = useSWR(
        `/api/adr?questionId=${questionId}&limit=100`,
        fetcher,
        { refreshInterval: 5000 }
    );

    if (error) {
        return <div className="p-4 text-sm text-red-400">Failed to load ADR scores.</div>;
    }

    if (isLoading && !data) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-zinc-500" />
            </div>
        );
    }

    const submissions: AdrScoreSubmissionInput[] = data?.data?.documents || [];
    const aggregation = aggregateAdrSubmissions(submissions, dimensions);

    const chartData = dimensions.map((dim) => {
        let valA = 0;
        let valB = 0;

        if (mode === "mine" && mySubmission) {
            try {
                const aScores = typeof mySubmission.optionAScores === "string" ? JSON.parse(mySubmission.optionAScores) : mySubmission.optionAScores;
                const bScores = typeof mySubmission.optionBScores === "string" ? JSON.parse(mySubmission.optionBScores) : mySubmission.optionBScores;
                valA = aScores[dim] || 0;
                valB = bScores[dim] || 0;
            } catch {
                valA = 0;
                valB = 0;
            }
        } else {
            const dimData = aggregation.dimensions[dim];
            if (dimData) {
                valA = mode === "weighted" ? dimData.optionA.weightedMean : dimData.optionA.mean;
                valB = mode === "weighted" ? dimData.optionB.weightedMean : dimData.optionB.mean;
            }
        }

        return {
            dimension: labelForDimension(dim),
            optionA: valA,
            optionB: valB,
        };
    });

    const getConfidenceBanner = () => {
        if (adrStatus === "concluded") {
            const winner = aggregation.consensus.aggregateGap > 0 ? optionA : optionB;
            return {
                text: `Community consensus reached — ${winner} is favored for this use case.`,
                color: "text-purple-400 bg-purple-500/10 border-purple-500/20"
            };
        }
        if (submissions.length < 10) {
            return {
                text: "Preliminary (<10 submissions) — Needs more responses.",
                color: "text-amber-400 bg-amber-500/10 border-amber-500/20"
            };
        }
        if (submissions.length < 30) {
            return {
                text: "Developing (10–30 submissions) — Trends are emerging.",
                color: "text-blue-400 bg-blue-500/10 border-blue-500/20"
            };
        }
        return {
            text: "Strong consensus (30+ submissions) — Highly reliable community aggregate.",
            color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
        };
    };

    const banner = getConfidenceBanner();

    const tableData = dimensions.map(dim => {
        const dimData = aggregation.dimensions[dim];
        if (!dimData) return null;
        const spread = dimData.optionA.mean - dimData.optionB.mean;
        return {
            id: dim,
            label: labelForDimension(dim),
            meanA: dimData.optionA.mean,
            meanB: dimData.optionB.mean,
            spread,
            agreement: dimData.optionA.stdDev + dimData.optionB.stdDev, // Lower stdDev is higher agreement
        };
    }).filter(Boolean) as { id: string, label: string, meanA: number, meanB: number, spread: number, agreement: number }[];

    // Sort by absolute spread magnitude by default
    tableData.sort((a, b) => Math.abs(b.spread) - Math.abs(a.spread));

    return (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-zinc-200">Community Consensus</h3>
                
                <div className="inline-flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-1">
                    <button
                        onClick={() => setMode("average")}
                        className={cn(
                            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            mode === "average" ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200"
                        )}
                    >
                        Community Average
                    </button>
                    <button
                        onClick={() => setMode("weighted")}
                        className={cn(
                            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                            mode === "weighted" ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200"
                        )}
                    >
                        Expertise-Weighted
                    </button>
                    {mySubmission && (
                        <button
                            onClick={() => setMode("mine")}
                            className={cn(
                                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                                mode === "mine" ? "bg-white/[0.08] text-white" : "text-zinc-400 hover:text-zinc-200"
                            )}
                        >
                            My Scores
                        </button>
                    )}
                </div>
            </div>

            <div className="h-[400px] w-full">
                {submissions.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                        No scores submitted yet. Be the first!
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="60%" data={chartData}>
                            <PolarGrid stroke="rgba(255,255,255,0.1)" />
                            <PolarAngleAxis dataKey="dimension" tick={{ fill: "#a1a1aa", fontSize: 12 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fill: "#52525b" }} />
                            <Radar
                                name={optionA}
                                dataKey="optionA"
                                stroke="#CFE8D5"
                                fill="#CFE8D5"
                                fillOpacity={0.3}
                            />
                            <Radar
                                name={optionB}
                                dataKey="optionB"
                                stroke="#D5CFE8"
                                fill="#D5CFE8"
                                fillOpacity={0.3}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px" }}
                                itemStyle={{ color: "#e4e4e7" }}
                            />
                            <Legend />
                        </RadarChart>
                    </ResponsiveContainer>
                )}
            </div>
            
            {submissions.length > 0 && (
                <>
                    <div className={cn("mt-6 rounded-lg border px-4 py-3 text-center text-sm font-medium", banner.color)}>
                        Based on {submissions.length} community assessment{submissions.length !== 1 ? "s" : ""}. {banner.text}
                    </div>

                    <div className="mt-4">
                        <button 
                            onClick={() => setTableOpen(!tableOpen)}
                            className="flex w-full items-center justify-between rounded-lg border border-white/[0.05] bg-white/[0.02] px-4 py-3 text-sm text-zinc-300 transition hover:bg-white/[0.04]"
                        >
                            <span>Dimension Breakdown Data</span>
                            {tableOpen ? <ChevronUp className="size-4 text-zinc-500" /> : <ChevronDown className="size-4 text-zinc-500" />}
                        </button>
                        
                        {tableOpen && (
                            <div className="mt-2 overflow-x-auto rounded-lg border border-white/[0.05]">
                                <table className="w-full text-left text-sm text-zinc-300">
                                    <thead className="bg-white/[0.02] text-xs uppercase text-zinc-500">
                                        <tr>
                                            <th className="px-4 py-3">Dimension</th>
                                            <th className="px-4 py-3">{optionA} (Mean)</th>
                                            <th className="px-4 py-3">{optionB} (Mean)</th>
                                            <th className="px-4 py-3">Spread</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.05]">
                                        {tableData.map(row => (
                                            <tr key={row.id} className="hover:bg-white/[0.01]">
                                                <td className="px-4 py-3 font-medium text-zinc-200">{row.label}</td>
                                                <td className="px-4 py-3">{row.meanA.toFixed(1)}</td>
                                                <td className="px-4 py-3">{row.meanB.toFixed(1)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={cn(
                                                        "inline-flex rounded px-2 py-0.5 text-xs font-medium",
                                                        row.spread > 0.5 ? "bg-[#CFE8D5]/10 text-[#CFE8D5]" : 
                                                        row.spread < -0.5 ? "bg-[#D5CFE8]/10 text-[#D5CFE8]" : 
                                                        "bg-zinc-500/10 text-zinc-400"
                                                    )}>
                                                        {row.spread > 0 ? `+${row.spread.toFixed(1)} ${optionA}` : 
                                                         row.spread < 0 ? `+${Math.abs(row.spread).toFixed(1)} ${optionB}` : 
                                                         "Tie"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
