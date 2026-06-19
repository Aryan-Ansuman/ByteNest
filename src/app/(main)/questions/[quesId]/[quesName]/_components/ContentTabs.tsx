"use client";

import React from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuestionDetail } from "./QuestionDetailContext";
import AnswerCard from "./AnswerCard";

type Tab = "ai" | "answers" | "discussion";

export default function ContentTabs({ isLoadingDynamic = false }: { isLoadingDynamic?: boolean }) {
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
    // Honest placeholder: no AI integration exists yet, so this is explicitly
    // marked "not available" rather than an infinite fake-loading skeleton.
    return (
        <div className="rounded-xl border border-white/[0.08] bg-black/20 p-8 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 text-[#CFE8D5]">
                <Sparkles className="size-5" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100">AI Answers coming soon</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
                This feature isn&apos;t wired up yet. Check the Answers tab for responses from the community in the meantime.
            </p>
        </div>
    );
}

function AnswersTab({ bestAnswer, communityAnswers, total }: { bestAnswer: any; communityAnswers: any[]; total: number }) {
    const { currentUser, openAnswerComposer, answerComposerOpen, closeAnswerComposer, submitAnswer } = useQuestionDetail();
    const [draft, setDraft] = React.useState("");
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!draft.trim()) return;
        setIsSubmitting(true);
        const posted = await submitAnswer(draft);
        setIsSubmitting(false);
        if (posted) {
            setDraft("");
            closeAnswerComposer();
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-100">{total} Answers</h3>
                {!answerComposerOpen && (
                    <button
                        onClick={openAnswerComposer}
                        className="flex h-9 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2]"
                    >
                        Write an answer
                    </button>
                )}
            </div>

            {/* Answer composer — this previously had no UI at all, so
                answerComposerOpen was tracked but never consumed. */}
            {answerComposerOpen && (
                <form
                    onSubmit={handleSubmit}
                    className="rounded-xl border border-white/[0.08] bg-black/20 p-4"
                >
                    <p className="mb-2 text-xs font-medium text-zinc-500">
                        Posting as {currentUser?.name ?? "you"}
                    </p>
                    <textarea
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="Write your answer... Markdown supported."
                        rows={6}
                        className="w-full resize-y rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#CFE8D5]/35"
                    />
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={closeAnswerComposer}
                            className="h-9 rounded-xl border border-white/[0.08] px-3.5 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || !draft.trim()}
                            className="flex h-9 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-3.5 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2] disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                            {isSubmitting ? "Posting..." : "Post answer"}
                        </button>
                    </div>
                </form>
            )}

            <div className="space-y-6">
                {bestAnswer && <AnswerCard answer={bestAnswer} variant="best" />}
                {communityAnswers.map((answer) => (
                    <AnswerCard key={answer.$id} answer={answer} />
                ))}
            </div>
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
