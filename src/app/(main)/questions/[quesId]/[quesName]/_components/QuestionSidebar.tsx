"use client";

import React from "react";
import Link from "next/link";
import {
    Activity,
    BookOpen,
    ChevronRight,
    Sparkles,
    Trophy,
    Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
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

    // ── Stable participant derivation ─────────────────────────────────────
    // We extract only the primitive arrays of authorIds/names from context
    // objects so the memo doesn't re-run on every vote optimistic update
    // (which creates new `answers` / `questionComments` object references
    // but doesn't change participant identity).

    const answerAuthorIds = React.useMemo(
        () => answers.documents.map((a) => a.authorId),
        [answers.documents]
    );
    const answerAuthorNames = React.useMemo(
        () => answers.documents.map((a) => a.author?.name ?? ""),
        [answers.documents]
    );
    const answerCommentAuthorIds = React.useMemo(
        () =>
            answers.documents.flatMap((a) =>
                (a.comments?.documents ?? []).map((c) => c.authorId)
            ),
        [answers.documents]
    );
    const answerCommentAuthorNames = React.useMemo(
        () =>
            answers.documents.flatMap((a) =>
                (a.comments?.documents ?? []).map((c) => c.author?.name ?? "")
            ),
        [answers.documents]
    );
    const qCommentAuthorIds = React.useMemo(
        () => questionComments.documents.map((c) => c.authorId),
        [questionComments.documents]
    );
    const qCommentAuthorNames = React.useMemo(
        () => questionComments.documents.map((c) => c.author?.name ?? ""),
        [questionComments.documents]
    );

    const uniqueParticipants = React.useMemo(() => {
        const users = new Map<string, string>();
        answerAuthorIds.forEach((id, i) => {
            if (id && answerAuthorNames[i]) users.set(id, answerAuthorNames[i]);
        });
        answerCommentAuthorIds.forEach((id, i) => {
            if (id && answerCommentAuthorNames[i]) users.set(id, answerCommentAuthorNames[i]);
        });
        qCommentAuthorIds.forEach((id, i) => {
            if (id && qCommentAuthorNames[i]) users.set(id, qCommentAuthorNames[i]);
        });
        return Array.from(users.values());
    }, [
        answerAuthorIds,
        answerAuthorNames,
        answerCommentAuthorIds,
        answerCommentAuthorNames,
        qCommentAuthorIds,
        qCommentAuthorNames,
    ]);

    const displayParticipants = uniqueParticipants.slice(0, 5);
    const extraParticipantsCount = Math.max(0, uniqueParticipants.length - 5);

    return (
        <aside aria-label="Question sidebar" className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            {/* ── AI Summary — honest coming-soon ── */}
            <SidebarCard className="border-[#CFE8D5]/20 bg-[linear-gradient(135deg,rgba(207,232,213,0.05),rgba(255,255,255,0.01))]">
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <span className="flex size-6 items-center justify-center rounded-full bg-[#CFE8D5]/10 text-[#CFE8D5]">
                        <Sparkles className="size-3.5" />
                    </span>
                    AI Summary
                    <span className="rounded bg-[#CFE8D5]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#CFE8D5]">
                        Beta
                    </span>
                </div>
                <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-[#CFE8D5]/10 bg-[#CFE8D5]/[0.03] px-4 py-5 text-center">
                    <div className="flex size-9 items-center justify-center rounded-full border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 text-[#CFE8D5]">
                        <Wand2 className="size-4" />
                    </div>
                    <p className="text-[13px] font-medium text-zinc-200">AI summaries coming soon</p>
                    <p className="text-[12px] leading-relaxed text-zinc-500">
                        One-click summaries of this thread aren&apos;t wired up yet. Check the community answers in the meantime.
                    </p>
                </div>
            </SidebarCard>

            {/* ── Best Solution ── */}
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
                                <p className="text-[13px] font-bold text-[#CFE8D5]">
                                    {bestAnswer.author.name}
                                </p>
                                <p className="text-[11px] text-zinc-500">Top Contributor</p>
                            </div>
                        </div>
                        <p className="mt-3 line-clamp-3 text-[13px] leading-relaxed text-zinc-400">
                            {markdownToPlainPreview(bestAnswer.content)}
                        </p>
                        <button
                            onClick={() => {
                                document
                                    .getElementById(`answer-${bestAnswer.$id}`)
                                    ?.scrollIntoView({ behavior: "smooth" });
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

            {/* ── Related Concepts — honest coming-soon ── */}
            <SidebarCard>
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <BookOpen className="size-4 text-blue-400" />
                    Related Concepts
                </div>
                <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-5 text-center">
                    <div className="flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-500">
                        <BookOpen className="size-4" />
                    </div>
                    <p className="text-[13px] font-medium text-zinc-300">Docs linking coming soon</p>
                    <p className="text-[12px] leading-relaxed text-zinc-500">
                        Tag-based documentation links will surface here once the integration is live.
                    </p>
                </div>
            </SidebarCard>

            {/* ── Similar Questions ── */}
            <SidebarCard>
                <div className="text-sm font-bold text-zinc-100">Similar Questions</div>
                <div className="mt-4 space-y-4">
                    {similarQuestions.length > 0 ? (
                        similarQuestions.map((q, i) => (
                            <div key={i} className="group">
                                <Link
                                    href={q.href}
                                    className="text-[13px] font-medium text-[#CFE8D5] transition group-hover:text-white"
                                >
                                    {q.title}
                                </Link>
                                <p className="mt-1 text-[11px] text-zinc-500">{q.answers} answers</p>
                            </div>
                        ))
                    ) : (
                        <p className="text-[13px] text-zinc-500">No similar questions found.</p>
                    )}
                </div>
                <button className="mt-4 flex w-full items-center justify-end gap-1 text-[12px] font-medium text-[#CFE8D5] hover:text-white">
                    View more <ChevronRight className="size-3" />
                </button>
            </SidebarCard>

            {/* ── Community Activity ── */}
            <SidebarCard>
                <div className="flex items-center gap-2 text-sm font-bold text-zinc-100">
                    <Activity className="size-4" /> Community Activity
                </div>
                <div className="mt-4 space-y-3">
                    <ActivityRow label="Answers added" value={answers.total} note="today" />
                    <ActivityRow label="Comments added" value={totalComments} note="lifetime" />
                    <ActivityRow label="People viewed" value={totalViews} note="lifetime" />
                </div>

                {displayParticipants.length > 0 && (
                    <div className="mt-5 flex items-center">
                        {displayParticipants.map((name, i) => {
                            const initials =
                                name
                                    .split(/\s+/)
                                    .filter(Boolean)
                                    .slice(0, 2)
                                    .map((p: string) => p[0]?.toUpperCase())
                                    .join("") || "?";
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
                )}

                <p className="mt-4 text-[12px] text-zinc-500">
                    {uniqueParticipants.length > 0
                        ? "Join the discussion!"
                        : "Be the first to share your thoughts!"}
                </p>
            </SidebarCard>
        </aside>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SidebarCard({
    children,
    className,
}: {
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-xl",
                className
            )}
        >
            {children}
        </div>
    );
}

function ActivityRow({
    label,
    value,
    note,
}: {
    label: string;
    value: number;
    note: string;
}) {
    return (
        <div className="flex items-center justify-between text-[13px]">
            <div className="flex items-center gap-4">
                <span className="w-6 text-lg font-bold text-zinc-100">{value}</span>
                <span className="text-zinc-400">{label}</span>
            </div>
            <span className="text-zinc-600">{note}</span>
        </div>
    );
}

function markdownToPlainPreview(content: string) {
    return content
        .replace(/```[\s\S]*?```/g, " [Code block] ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/!\[[^\]]*]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^>\s?/gm, "")
        .replace(/[*_~]+/g, "")
        .replace(/<[^>]*>?/gm, "")
        .replace(/\s+/g, " ")
        .trim();
}
