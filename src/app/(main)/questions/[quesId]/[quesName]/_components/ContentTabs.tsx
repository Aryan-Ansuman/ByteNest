"use client";

import React, from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuestionDetail } from "./QuestionDetailContext";
import AnswerCard from "./AnswerCard";

type Tab = "ai" | "answers" | "discussion";

export default function ContentTabs() {
    const [activeTab, setActiveTab] = React.useState<Tab>("answers");
    const { answers, bestAnswer, communityAnswers } = useQuestionDetail();

    return (
        <div className="mt-10">
            {/* Tabs Header */}
            <div className="flex items-center gap-6 border-b border-white/[0.08]">
                <TabButton 
                    active={activeTab === "ai"} 
                    onClick={() => setActiveTab("ai")}
                    icon={<Sparkles className="size-4" />}
                    label="AI Answer"
                />
                <TabButton 
                    active={activeTab === "answers"} 
                    onClick={() => setActiveTab("answers")}
                    label={`Answers`}
                    count={answers.total}
                />
                <TabButton 
                    active={activeTab === "discussion"} 
                    onClick={() => setActiveTab("discussion")}
                    label="Discussion"
                    count={3} // Mocking discussion count for now based on UI
                />
            </div>

            {/* Tab Content */}
            <div className="mt-6">
                {activeTab === "ai" && <AiAnswerTab />}
                {activeTab === "answers" && (
                    <AnswersTab 
                        bestAnswer={bestAnswer} 
                        communityAnswers={communityAnswers} 
                        total={answers.total} 
                    />
                )}
                {activeTab === "discussion" && <DiscussionTab />}
            </div>
        </div>
    );
}

function TabButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon?: React.ReactNode; label: string; count?: number }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex items-center gap-2 pb-3 text-[14px] font-medium transition-colors",
                active ? "text-[#CFE8D5]" : "text-zinc-500 hover:text-zinc-300"
            )}
        >
            {icon && <span className={active ? "text-[#CFE8D5]" : "text-zinc-500"}>{icon}</span>}
            {label}
            {count !== undefined && (
                <span className={cn(
                    "ml-1 flex h-5 items-center justify-center rounded-full px-2 text-[11px]",
                    active ? "bg-[#CFE8D5]/10 text-[#CFE8D5]" : "bg-white/[0.05] text-zinc-400"
                )}>
                    {count}
                </span>
            )}
            
            {active && (
                <div className="absolute inset-x-0 bottom-[-1px] h-0.5 bg-[#CFE8D5]" />
            )}
        </button>
    );
}

function AiAnswerTab() {
    return (
        <div className="rounded-xl border border-white/[0.08] bg-black/20 p-8 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 text-[#CFE8D5]">
                <Sparkles className="size-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100">AI Analysis in Progress</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
                The AI is currently analyzing this question and community responses to formulate a comprehensive answer.
            </p>
            
            <div className="mt-8 space-y-3">
                <div className="mx-auto h-4 w-3/4 animate-pulse rounded bg-white/[0.05]" />
                <div className="mx-auto h-4 w-5/6 animate-pulse rounded bg-white/[0.05]" />
                <div className="mx-auto h-4 w-2/3 animate-pulse rounded bg-white/[0.05]" />
            </div>
        </div>
    );
}

function AnswersTab({ bestAnswer, communityAnswers, total }: { bestAnswer: any; communityAnswers: any[]; total: number }) {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                <p className="text-sm text-zinc-300">
                    Based on your code, here are the most likely reasons and fixes.
                </p>
                <span className="rounded bg-white/[0.05] px-2 py-0.5 text-[11px] font-bold tracking-wider text-[#CFE8D5]">
                    Beta
                </span>
            </div>

            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-100">{total} Answers</h3>
                <div className="flex overflow-hidden rounded-lg border border-white/[0.08] bg-black/20 text-[13px]">
                    <button className="px-4 py-1.5 text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200">Oldest</button>
                    <button className="bg-white/[0.05] px-4 py-1.5 font-medium text-[#CFE8D5]">Most Voted</button>
                    <button className="px-4 py-1.5 text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200">Newest</button>
                </div>
            </div>

            <div className="space-y-6">
                {bestAnswer && <AnswerCard answer={bestAnswer} variant="best" />}
                {communityAnswers.map((answer) => (
                    <AnswerCard key={answer.$id} answer={answer} />
                ))}
            </div>

            {total > communityAnswers.length + (bestAnswer ? 1 : 0) && (
                <button className="w-full rounded-xl border border-white/[0.08] bg-black/20 py-3 text-[13px] font-medium text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-200">
                    Show {total - communityAnswers.length - (bestAnswer ? 1 : 0)} more answers
                </button>
            )}
        </div>
    );
}

function DiscussionTab() {
    return (
        <div className="rounded-xl border border-white/[0.08] bg-black/20 p-8 text-center">
            <h3 className="text-lg font-bold text-zinc-100">Discussion thread</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
                Comments and discussion will appear here.
            </p>
        </div>
    );
}
