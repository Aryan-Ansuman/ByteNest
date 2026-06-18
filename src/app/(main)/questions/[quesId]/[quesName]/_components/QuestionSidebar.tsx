"use client";

import React from "react";
import Link from "next/link";
import {
    Activity,
    BookOpen,
    Check,
    ChevronRight,
    ExternalLink,
    Sparkles,
    Trophy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import convertDateToRelativeTime from "@/utils/relativeTime";
import { useQuestionDetail } from "./QuestionDetailContext";

export default function QuestionSidebar() {
    const {
        answers,
        totalComments,
        totalViews,
        bestAnswer,
        similarQuestions = [],
        questionComments,
    } = useQuestionDetail();

    const uniqueParticipants = React.useMemo(() => {
        const users = new Map();
        
        answers.documents.forEach((ans) => {
            if (ans.author) {
                users.set(ans.authorId, ans.author.name);
            }
            if (ans.comments && ans.comments.documents) {
                ans.comments.documents.forEach((c) => {
                    if (c.author) users.set(c.authorId, c.author.name);
                });
            }
        });

        if (questionComments && questionComments.documents) {
            questionComments.documents.forEach((c) => {
                if (c.author) users.set(c.authorId, c.author.name);
            });
        }

        return Array.from(users.values());
    }, [answers, questionComments]);

    const displayParticipants = uniqueParticipants.slice(0, 5);
    const extraParticipantsCount = Math.max(0, uniqueParticipants.length - 5);

    return (
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            {/* AI Summary Skeleton */}
            <SidebarCard className="border-[#CFE8D5]/20 bg-[linear-gradient(135deg,rgba(207,232,213,0.05),rgba(255,255,255,0.01))]">
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <span className="flex size-6 items-center justify-center rounded-full bg-[#CFE8D5]/10 text-[#CFE8D5]">
                        <Sparkles className="size-3.5" />
                    </span>
                    AI Summary
                    <span className="rounded bg-[#CFE8D5]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#CFE8D5]">Beta</span>
                </div>
                <div className="mt-4 space-y-3">
                    <div className="h-3 w-full animate-pulse rounded bg-white/[0.08]" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-white/[0.08]" />
                    <div className="h-3 w-4/6 animate-pulse rounded bg-white/[0.08]" />
                </div>
                <div className="mt-5 space-y-2">
                    <div className="flex items-center gap-2">
                        <div className="size-1.5 rounded-full bg-white/[0.2]" />
                        <div className="h-2.5 w-3/4 animate-pulse rounded bg-white/[0.06]" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="size-1.5 rounded-full bg-white/[0.2]" />
                        <div className="h-2.5 w-2/3 animate-pulse rounded bg-white/[0.06]" />
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="size-1.5 rounded-full bg-white/[0.2]" />
                        <div className="h-2.5 w-5/6 animate-pulse rounded bg-white/[0.06]" />
                    </div>
                </div>
                <button className="mt-5 flex w-full items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] font-medium text-zinc-300 transition hover:bg-white/[0.06]">
                    <Sparkles className="size-3.5 text-[#CFE8D5]" />
                    Generate AI summary
                </button>
            </SidebarCard>

            {/* Best Solution */}
            <SidebarCard className="border-[#CFE8D5]/20 bg-[linear-gradient(135deg,rgba(207,232,213,0.03),rgba(255,255,255,0.01))]">
                <div className="flex items-center gap-2 text-sm font-bold text-[#CFE8D5]">
                    <Trophy className="size-4" />
                    Best Solution
                </div>
                {bestAnswer ? (
                    <div className="mt-4">
                        <div className="flex items-center gap-2">
                            <span className="flex size-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-300">
                                {bestAnswer.author.name.charAt(0).toUpperCase()}
                            </span>
                            <div>
                                <p className="text-[13px] font-bold text-[#CFE8D5]">{bestAnswer.author.name}</p>
                                <p className="text-[11px] text-zinc-500">Top Contributor</p>
                            </div>
                        </div>
                        <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-zinc-400">
                            {bestAnswer.content.replace(/```[\s\S]*?```/g, "[Code block]").replace(/<[^>]*>?/gm, '')}
                        </p>
                        <button 
                            onClick={() => {
                                document.getElementById(`answer-${bestAnswer.$id}`)?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="mt-4 w-full rounded-lg bg-white/[0.05] py-2 text-[13px] font-medium text-zinc-300 transition hover:bg-white/[0.08]"
                        >
                            View full answer
                        </button>
                    </div>
                ) : (
                    <p className="mt-3 text-[13px] text-zinc-500">No accepted answer yet.</p>
                )}
            </SidebarCard>

            {/* Related Concepts Skeleton */}
            <SidebarCard>
                <div className="text-sm font-bold text-zinc-100">Related Concepts</div>
                <div className="mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex size-6 items-center justify-center rounded bg-blue-500/20 text-blue-400">
                                <BookOpen className="size-3.5" />
                            </div>
                            <div className="h-3 w-24 animate-pulse rounded bg-white/[0.08]" />
                        </div>
                        <div className="h-3 w-16 animate-pulse rounded bg-white/[0.04]" />
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex size-6 items-center justify-center rounded bg-purple-500/20 text-purple-400">
                                <Activity className="size-3.5" />
                            </div>
                            <div className="h-3 w-32 animate-pulse rounded bg-white/[0.08]" />
                        </div>
                        <div className="h-3 w-12 animate-pulse rounded bg-white/[0.04]" />
                    </div>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex size-6 items-center justify-center rounded bg-green-500/20 text-green-400">
                                <Check className="size-3.5" />
                            </div>
                            <div className="h-3 w-28 animate-pulse rounded bg-white/[0.08]" />
                        </div>
                        <div className="h-3 w-14 animate-pulse rounded bg-white/[0.04]" />
                    </div>
                </div>
                <button className="mt-4 w-full border-t border-white/[0.08] pt-3 text-[13px] font-medium text-zinc-400 hover:text-zinc-200">
                    Explore more
                </button>
            </SidebarCard>

            {/* Similar Questions */}
            <SidebarCard>
                <div className="text-sm font-bold text-zinc-100">Similar Questions</div>
                <div className="mt-4 space-y-4">
                    {similarQuestions.length > 0 ? similarQuestions.map((q, i) => (
                        <div key={i} className="group">
                            <Link href={q.href} className="text-[13px] font-medium text-[#CFE8D5] transition group-hover:text-white">
                                {q.title}
                            </Link>
                            <p className="mt-1 text-[11px] text-zinc-500">{q.answers} answers</p>
                        </div>
                    )) : (
                        <p className="text-[13px] text-zinc-500">No similar questions found.</p>
                    )}
                </div>
                <button className="mt-4 flex w-full items-center justify-end gap-1 text-[12px] font-medium text-[#CFE8D5] hover:text-white">
                    View more <ChevronRight className="size-3" />
                </button>
            </SidebarCard>

            {/* Community Activity */}
            <SidebarCard>
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Activity className="size-4" /> Community Activity
                </div>
                <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between text-[13px]">
                        <div className="flex items-center gap-4">
                            <span className="w-6 text-lg font-bold text-zinc-100">{answers.total}</span>
                            <span className="text-zinc-400">Answers added</span>
                        </div>
                        <span className="text-zinc-600">today</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                        <div className="flex items-center gap-4">
                            <span className="w-6 text-lg font-bold text-zinc-100">{totalComments}</span>
                            <span className="text-zinc-400">Comments added</span>
                        </div>
                        <span className="text-zinc-600">recent</span>
                    </div>
                    <div className="flex items-center justify-between text-[13px]">
                        <div className="flex items-center gap-4">
                            <span className="w-6 text-lg font-bold text-zinc-100">{totalViews}</span>
                            <span className="text-zinc-400">People viewed</span>
                        </div>
                        <span className="text-zinc-600">lifetime</span>
                    </div>
                </div>
                {displayParticipants.length > 0 ? (
                    <div className="mt-5 flex items-center">
                        {displayParticipants.map((name, i) => {
                            const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p: string) => p[0]?.toUpperCase()).join("") || "?";
                            return (
                                <span
                                    key={`${name}-${i}`}
                                    className="-ml-2 first:ml-0 flex size-7 items-center justify-center rounded-full border border-black bg-[#CFE8D5] text-[9px] font-bold text-[#07100B]"
                                    style={{ zIndex: 10 - i }}
                                    title={name}
                                >
                                    {initials}
                                </span>
                            );
                        })}
                        {extraParticipantsCount > 0 && (
                            <span className="-ml-2 flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[10px] text-[#CFE8D5]">
                                +{extraParticipantsCount}
                            </span>
                        )}
                    </div>
                ) : null}
                <p className="mt-4 text-[12px] text-zinc-500">
                    {uniqueParticipants.length > 0 ? "Join the discussion!" : "Be the first to share your thoughts!"}
                </p>
            </SidebarCard>
        </aside>
    );
}

function SidebarCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return <div className={cn("rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-xl", className)}>{children}</div>;
}
