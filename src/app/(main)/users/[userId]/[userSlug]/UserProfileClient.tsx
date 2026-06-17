"use client";

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowUp,
    ArrowDown,
    MessageCircle,
    Clock,
    Tag,
    Search,
    Plus,
    HomeIcon,
    Tags,
    UserRound,
    Bookmark,
    Award,
    BarChart3,
    FileQuestion,
    MessageSquare,
    ThumbsUp,
    Calendar,
    Activity,
    Pencil,
    ChevronRight,
    Star,
    TrendingUp,
    Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/Auth";
import { avatars } from "@/models/client/config";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
    $id: string;
    title: string;
    tags: string[];
    $createdAt: string;
    totalVotes: number;
    totalAnswers: number;
}

interface Answer {
    $id: string;
    content: string;
    $createdAt: string;
    questionId: string;
    questionTitle: string;
    totalVotes: number;
}

interface Vote {
    $id: string;
    voteStatus: string;
    type: string;
    typeId: string;
    $createdAt: string;
    questionId: string;
    questionTitle: string;
}

interface ProfileData {
    userId: string;
    userSlug: string;
    name: string;
    email: string;
    reputation: number;
    createdAt: string;
    updatedAt: string;
    totalQuestions: number;
    totalAnswers: number;
    totalVotes: number;
    questions: Question[];
    answers: Answer[];
    votes: Vote[];
}

type Tab = "overview" | "questions" | "answers" | "votes";


const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <BarChart3 className="size-4" /> },
    { id: "questions", label: "Questions", icon: <FileQuestion className="size-4" /> },
    { id: "answers", label: "Answers", icon: <MessageSquare className="size-4" /> },
    { id: "votes", label: "Votes", icon: <ThumbsUp className="size-4" /> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UserProfileClient({ profile }: { profile: ProfileData }) {
    const { user } = useAuthStore();
    const [activeTab, setActiveTab] = React.useState<Tab>("overview");
    const isOwnProfile = user?.$id === profile.userId;

    // Compute a rough "top tag" from questions
    const tagFrequency = React.useMemo(() => {
        const freq: Record<string, number> = {};
        profile.questions.forEach((q) => q.tags.forEach((t) => (freq[t] = (freq[t] || 0) + 1)));
        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);
    }, [profile.questions]);

    const reputationLevel =
        profile.reputation < 50
            ? { label: "Newcomer", color: "text-zinc-400", bg: "bg-zinc-800" }
            : profile.reputation < 200
            ? { label: "Contributor", color: "text-blue-400", bg: "bg-blue-900/30" }
            : profile.reputation < 500
            ? { label: "Regular", color: "text-[#a7c8b3]", bg: "bg-[#a7c8b3]/10" }
            : profile.reputation < 1000
            ? { label: "Trusted", color: "text-emerald-400", bg: "bg-emerald-900/30" }
            : { label: "Expert", color: "text-amber-400", bg: "bg-amber-900/30" };

    return (
        <>
            {/* ── Profile Hero ── */}
            <ProfileHero
                profile={profile}
                isOwnProfile={isOwnProfile}
                reputationLevel={reputationLevel}
            />

            {/* ── Stats Row ── */}
            <StatsRow profile={profile} />

            {/* ── Tab Bar ── */}
            <div className="mt-8 flex items-center gap-0 border-b border-white/10">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition duration-200",
                            activeTab === tab.id
                                ? "text-[#a7c8b3]"
                                : "text-zinc-500 hover:text-zinc-300"
                        )}
                    >
                        {tab.icon}
                        <span className="hidden sm:inline">{tab.label}</span>
                        {activeTab === tab.id && (
                            <motion.div
                                layoutId="profile-tab-indicator"
                                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#a7c8b3]"
                                transition={{ duration: 0.18, ease: "easeOut" }}
                            />
                        )}
                    </button>
                ))}
            </div>

            {/* ── Tab Panels ── */}
            <div className="mt-6">
                <AnimatePresence mode="wait">
                    {activeTab === "overview" && (
                        <TabPanel key="overview">
                            <OverviewTab profile={profile} tagFrequency={tagFrequency} />
                        </TabPanel>
                    )}
                    {activeTab === "questions" && (
                        <TabPanel key="questions">
                            <QuestionsTab questions={profile.questions} total={profile.totalQuestions} />
                        </TabPanel>
                    )}
                    {activeTab === "answers" && (
                        <TabPanel key="answers">
                            <AnswersTab answers={profile.answers} total={profile.totalAnswers} />
                        </TabPanel>
                    )}
                    {activeTab === "votes" && (
                        <TabPanel key="votes">
                            <VotesTab votes={profile.votes} total={profile.totalVotes} />
                        </TabPanel>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
}

// ─── Profile Hero ─────────────────────────────────────────────────────────────

function ProfileHero({
    profile,
    isOwnProfile,
    reputationLevel,
}: {
    profile: ProfileData;
    isOwnProfile: boolean;
    reputationLevel: { label: string; color: string; bg: string };
}) {
    return (
        <div className="flex flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.025] p-6 sm:flex-row sm:items-start">
            {/* Avatar */}
            <div className="shrink-0">
                <div className="relative">
                    <img
                        src={avatars.getInitials(profile.name, 96, 96).href}
                        alt={profile.name}
                        className="size-24 rounded-2xl border border-white/10 object-cover"
                    />
                    {/* Reputation badge overlay */}
                    <div
                        className={cn(
                            "absolute -bottom-2 -right-2 rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-semibold",
                            reputationLevel.bg,
                            reputationLevel.color
                        )}
                    >
                        {reputationLevel.label}
                    </div>
                </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
                            {profile.name}
                        </h1>
                        <p className="mt-0.5 text-sm text-zinc-500">{profile.email}</p>
                    </div>

                    {isOwnProfile && (
                        <Link
                            href={`/users/${profile.userId}/${profile.userSlug}/edit`}
                            className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                        >
                            <Pencil className="size-4" />
                            Edit profile
                        </Link>
                    )}
                </div>

                {/* Meta row */}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-500">
                    <span className="flex items-center gap-1.5">
                        <Calendar className="size-3.5 text-zinc-600" />
                        Joined {convertDateToRelativeTime(new Date(profile.createdAt))}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Activity className="size-3.5 text-zinc-600" />
                        Active {convertDateToRelativeTime(new Date(profile.updatedAt))}
                    </span>
                    <span className="flex items-center gap-1.5">
                        <Star className="size-3.5 text-amber-500/70" />
                        <span className={cn("font-semibold", reputationLevel.color)}>
                            {profile.reputation.toLocaleString()}
                        </span>
                        <span>reputation</span>
                    </span>
                </div>

                {/* Reputation progress bar */}
                <div className="mt-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-600">
                        <span>Reputation progress</span>
                        <span>{profile.reputation} / {profile.reputation < 50 ? 50 : profile.reputation < 200 ? 200 : profile.reputation < 500 ? 500 : profile.reputation < 1000 ? 1000 : "1000+"}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-[#a7c8b3] to-emerald-400"
                            initial={{ width: 0 }}
                            animate={{
                                width: `${Math.min(
                                    (profile.reputation /
                                        (profile.reputation < 50
                                            ? 50
                                            : profile.reputation < 200
                                            ? 200
                                            : profile.reputation < 500
                                            ? 500
                                            : 1000)) *
                                        100,
                                    100
                                )}%`,
                            }}
                            transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function StatsRow({ profile }: { profile: ProfileData }) {
    const stats = [
        {
            label: "Questions",
            value: profile.totalQuestions,
            icon: <FileQuestion className="size-5" />,
            color: "text-blue-400",
            bg: "bg-blue-900/20",
            border: "border-blue-800/30",
        },
        {
            label: "Answers",
            value: profile.totalAnswers,
            icon: <MessageSquare className="size-5" />,
            color: "text-[#a7c8b3]",
            bg: "bg-[#a7c8b3]/10",
            border: "border-[#a7c8b3]/20",
        },
        {
            label: "Votes Cast",
            value: profile.totalVotes,
            icon: <ThumbsUp className="size-5" />,
            color: "text-amber-400",
            bg: "bg-amber-900/20",
            border: "border-amber-800/30",
        },
        {
            label: "Reputation",
            value: profile.reputation,
            icon: <Award className="size-5" />,
            color: "text-purple-400",
            bg: "bg-purple-900/20",
            border: "border-purple-800/30",
        },
    ];

    return (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat, i) => (
                <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.07 }}
                    className={cn(
                        "flex flex-col gap-3 rounded-xl border p-4 transition duration-200 hover:bg-white/[0.04]",
                        stat.border,
                        stat.bg
                    )}
                >
                    <div className={cn("flex size-9 items-center justify-center rounded-xl border", stat.border, stat.color)}>
                        {stat.icon}
                    </div>
                    <div>
                        <p className="text-2xl font-bold tracking-tight text-zinc-50">
                            {stat.value.toLocaleString()}
                        </p>
                        <p className="text-xs text-zinc-500">{stat.label}</p>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

// ─── Tab Panel wrapper ────────────────────────────────────────────────────────

function TabPanel({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
        >
            {children}
        </motion.div>
    );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
    profile,
    tagFrequency,
}: {
    profile: ProfileData;
    tagFrequency: [string, number][];
}) {
    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Recent Questions */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-200">
                        <FileQuestion className="size-4 text-blue-400" />
                        Recent Questions
                    </h2>
                    <span className="text-xs text-zinc-600">{profile.totalQuestions} total</span>
                </div>
                {profile.questions.length === 0 ? (
                    <EmptySlate message="No questions yet" />
                ) : (
                    <div className="space-y-2">
                        {profile.questions.slice(0, 5).map((q) => (
                            <Link
                                key={q.$id}
                                href={`/questions/${q.$id}/${slugify(q.title)}`}
                                className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/10 hover:bg-white/[0.05]"
                            >
                                <div className="mt-0.5 flex shrink-0 flex-col items-center gap-0.5 text-xs text-zinc-600">
                                    <ArrowUp className="size-3" />
                                    <span className="font-medium text-zinc-400">{q.totalVotes}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-zinc-300 transition group-hover:text-[#a7c8b3]">
                                        {q.title}
                                    </p>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="text-xs text-zinc-600">
                                            {convertDateToRelativeTime(new Date(q.$createdAt))}
                                        </span>
                                        <span className="text-zinc-700">·</span>
                                        <span className="text-xs text-zinc-600">
                                            {q.totalAnswers} ans
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Recent Answers */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-200">
                        <MessageSquare className="size-4 text-[#a7c8b3]" />
                        Recent Answers
                    </h2>
                    <span className="text-xs text-zinc-600">{profile.totalAnswers} total</span>
                </div>
                {profile.answers.length === 0 ? (
                    <EmptySlate message="No answers yet" />
                ) : (
                    <div className="space-y-2">
                        {profile.answers.slice(0, 5).map((a) => (
                            <Link
                                key={a.$id}
                                href={`/questions/${a.questionId}/${slugify(a.questionTitle)}`}
                                className="group flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition hover:border-white/10 hover:bg-white/[0.05]"
                            >
                                <div className="mt-0.5 flex shrink-0 flex-col items-center gap-0.5 text-xs text-zinc-600">
                                    <ArrowUp className="size-3" />
                                    <span className="font-medium text-zinc-400">{a.totalVotes}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-zinc-300 transition group-hover:text-[#a7c8b3]">
                                        {a.questionTitle}
                                    </p>
                                    <p className="mt-1 line-clamp-1 text-xs text-zinc-600">
                                        {a.content.replace(/[#*`_>\[\]!]/g, "").slice(0, 80)}
                                    </p>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>

            {/* Tag expertise */}
            {tagFrequency.length > 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:col-span-2">
                    <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-zinc-200">
                        <TrendingUp className="size-4 text-amber-400" />
                        Tag Expertise
                    </h2>
                    <div className="flex flex-wrap gap-2">
                        {tagFrequency.map(([tag, count]) => {
                            const maxCount = tagFrequency[0][1];
                            const pct = Math.round((count / maxCount) * 100);
                            return (
                                <Link
                                    key={tag}
                                    href={`/questions?tag=${tag}`}
                                    className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:border-[#a7c8b3]/30"
                                >
                                    {/* background bar */}
                                    <div
                                        className="absolute inset-y-0 left-0 bg-[#a7c8b3]/8 transition-all group-hover:bg-[#a7c8b3]/15"
                                        style={{ width: `${pct}%` }}
                                    />
                                    <span className="relative flex items-center gap-2 text-xs">
                                        <Hash className="size-3 text-[#a7c8b3]/60" />
                                        <span className="font-medium text-zinc-300">{tag}</span>
                                        <span className="text-zinc-600">{count}×</span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Questions Tab ────────────────────────────────────────────────────────────

function QuestionsTab({ questions, total }: { questions: Question[]; total: number }) {
    return (
        <div>
            <div className="mb-4 flex items-center justify-between">
                <p className="text-sm text-zinc-500">
                    Showing {questions.length} of {total} questions
                </p>
                <Link
                    href="/questions/ask"
                    className="flex h-8 items-center gap-1.5 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-3 text-xs font-medium text-[#a7c8b3] transition hover:bg-[#a7c8b3]/20"
                >
                    <Plus className="size-3" />
                    Ask question
                </Link>
            </div>
            {questions.length === 0 ? (
                <EmptySlate message="No questions asked yet" />
            ) : (
                <div className="space-y-3">
                    {questions.map((q) => (
                        <Link
                            key={q.$id}
                            href={`/questions/${q.$id}/${slugify(q.title)}`}
                            className="group flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-white/15 hover:bg-white/[0.04]"
                        >
                            {/* Stats */}
                            <div className="grid shrink-0 grid-cols-2 gap-2 sm:w-32 sm:grid-cols-1">
                                <StatMini label="votes" value={q.totalVotes} emphasized={q.totalVotes > 0} />
                                <StatMini label="answers" value={q.totalAnswers} emphasized={q.totalAnswers > 0} />
                            </div>
                            {/* Body */}
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold text-zinc-200 transition group-hover:text-[#a7c8b3] sm:text-base">
                                    {q.title}
                                </h3>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {q.tags.slice(0, 4).map((tag) => (
                                        <span
                                            key={tag}
                                            className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-zinc-500"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                    <span className="ml-auto text-xs text-zinc-600">
                                        {convertDateToRelativeTime(new Date(q.$createdAt))}
                                    </span>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Answers Tab ──────────────────────────────────────────────────────────────

function AnswersTab({ answers, total }: { answers: Answer[]; total: number }) {
    return (
        <div>
            <p className="mb-4 text-sm text-zinc-500">
                Showing {answers.length} of {total} answers
            </p>
            {answers.length === 0 ? (
                <EmptySlate message="No answers given yet" />
            ) : (
                <div className="space-y-3">
                    {answers.map((a) => (
                        <Link
                            key={a.$id}
                            href={`/questions/${a.questionId}/${slugify(a.questionTitle)}`}
                            className="group block rounded-xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-white/15 hover:bg-white/[0.04]"
                        >
                            {/* Question link */}
                            <div className="flex items-start gap-3">
                                <div className="flex shrink-0 flex-col items-center gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 text-center">
                                    <ArrowUp className="size-3.5 text-zinc-500" />
                                    <span className="text-sm font-bold text-zinc-100">{a.totalVotes}</span>
                                    <span className="text-[10px] text-zinc-600">votes</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-zinc-500">
                                        Answer to:
                                    </p>
                                    <p className="mt-0.5 text-sm font-semibold text-zinc-200 transition group-hover:text-[#a7c8b3]">
                                        {a.questionTitle}
                                    </p>
                                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                                        {a.content.replace(/[#*`_>\[\]!]/g, "").replace(/\n+/g, " ").slice(0, 180)}
                                    </p>
                                    <p className="mt-2 text-xs text-zinc-600">
                                        {convertDateToRelativeTime(new Date(a.$createdAt))}
                                    </p>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Votes Tab ────────────────────────────────────────────────────────────────

function VotesTab({ votes, total }: { votes: Vote[]; total: number }) {
    const [filter, setFilter] = React.useState<"all" | "upvoted" | "downvoted">("all");

    const filtered = React.useMemo(
        () => (filter === "all" ? votes : votes.filter((v) => v.voteStatus === filter)),
        [votes, filter]
    );

    const upvotes = votes.filter((v) => v.voteStatus === "upvoted").length;
    const downvotes = votes.filter((v) => v.voteStatus === "downvoted").length;

    return (
        <div>
            {/* Filter row */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-zinc-500">
                    {total} votes cast · {upvotes} up · {downvotes} down
                </p>
                <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                    {(["all", "upvoted", "downvoted"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={cn(
                                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                                filter === f
                                    ? f === "upvoted"
                                        ? "bg-[#a7c8b3] text-[#08100b]"
                                        : f === "downvoted"
                                        ? "bg-red-500/80 text-white"
                                        : "bg-zinc-700 text-zinc-100"
                                    : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            {f === "all" ? "All" : f === "upvoted" ? "↑ Upvoted" : "↓ Downvoted"}
                        </button>
                    ))}
                </div>
            </div>

            {filtered.length === 0 ? (
                <EmptySlate message="No votes in this category" />
            ) : (
                <div className="space-y-2">
                    {filtered.map((v) => (
                        <Link
                            key={v.$id}
                            href={`/questions/${v.questionId}/${slugify(v.questionTitle)}`}
                            className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 transition hover:border-white/15 hover:bg-white/[0.04]"
                        >
                            <div
                                className={cn(
                                    "flex size-8 shrink-0 items-center justify-center rounded-xl border text-sm font-bold transition",
                                    v.voteStatus === "upvoted"
                                        ? "border-[#a7c8b3]/30 bg-[#a7c8b3]/10 text-[#a7c8b3]"
                                        : "border-red-400/30 bg-red-400/10 text-red-400"
                                )}
                            >
                                {v.voteStatus === "upvoted" ? "↑" : "↓"}
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-zinc-300 transition group-hover:text-[#a7c8b3]">
                                    {v.questionTitle}
                                </p>
                                <p className="mt-0.5 text-xs text-zinc-600">
                                    {v.type} · {convertDateToRelativeTime(new Date(v.$createdAt))}
                                </p>
                            </div>
                            <ChevronRight className="size-4 shrink-0 text-zinc-700 transition group-hover:text-zinc-400" />
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatMini({
    label,
    value,
    emphasized,
}: {
    label: string;
    value: number;
    emphasized?: boolean;
}) {
    return (
        <div
            className={cn(
                "rounded-xl border px-2.5 py-2",
                emphasized
                    ? "border-[#a7c8b3]/20 bg-[#a7c8b3]/10"
                    : "border-white/10 bg-black/20"
            )}
        >
            <p className="text-base font-bold text-zinc-100">{value}</p>
            <p className="text-[11px] text-zinc-600">{label}</p>
        </div>
    );
}

function EmptySlate({ message }: { message: string }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-white/[0.02] py-12 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                <MessageCircle className="size-5 text-zinc-600" />
            </div>
            <p className="text-sm text-zinc-500">{message}</p>
        </div>
    );
}

