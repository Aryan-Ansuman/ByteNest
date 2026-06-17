"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
    MessageCircle,
    Plus,
    TrendingUp,
    Clock,
    Eye,
    Star,
    ChevronRight,
    Bookmark,
    ArrowUp,
    ArrowDown,
    Trophy,
    Hash,
    Newspaper,
    Flame,
    MessageSquare,
    Zap,
    Settings2,
    ExternalLink,
    Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";
import { useAuthStore } from "@/store/Auth";
import { avatars } from "@/models/client/config";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Question {
    $id: string;
    title: string;
    content: string;
    tags: string[];
    $createdAt: string;
    totalAnswers: number;
    totalVotes: number;
    author: {
        $id: string;
        name: string;
        reputation: number;
    };
}

interface Props {
    questions: Question[];
    totalQuestions: number;
    totalAnswers: number;
    initialFilter: string;
    trendingTags: { tag: string; questions: number }[];
    communityHighlights: { name: string; $id: string; reputation: number }[];
    developerNews: { title: string; time: string; $id: string; slug: string }[];
}

// ─── Feed Tab Config ──────────────────────────────────────────────────────────

const feedTabs = [
    { id: "For you", label: "For you" },
    { id: "Trending", label: "Trending" },
    { id: "Unanswered", label: "Unanswered" },
    { id: "Most viewed", label: "Most viewed" },
    { id: "Recent", label: "Recent" },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeClient({ 
    questions, 
    totalQuestions, 
    totalAnswers, 
    initialFilter,
    trendingTags,
    communityHighlights,
    developerNews,
}: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { session, user } = useAuthStore();

    const [activeFilter, setActiveFilter] = React.useState(initialFilter === "Newest" ? "For you" : initialFilter);
    const [askInput, setAskInput] = React.useState("");

    const handleFilterChange = (filter: string) => {
        setActiveFilter(filter);
        const p = new URLSearchParams(searchParams.toString());
        const mapped = filter === "For you" || filter === "Recent" ? "Newest" : filter;
        p.set("filter", mapped);
        router.push(`${pathname}?${p.toString()}`);
    };

    const handleAskSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        router.push(`/questions/ask`);
    };

    const displayedQuestions = React.useMemo(() => {
        let q = [...questions];
        if (activeFilter === "Trending") q.sort((a, b) => b.totalVotes - a.totalVotes);
        if (activeFilter === "Unanswered") q = q.filter((q) => q.totalAnswers === 0);
        if (activeFilter === "Most viewed") q.sort((a, b) => b.totalAnswers - a.totalAnswers);
        return q;
    }, [questions, activeFilter]);

    return (
        <div className="flex gap-6">
            {/* ── Main Column ── */}
            <div className="min-w-0 flex-1">

                {/* Hero Banner */}
                <HeroBanner
                    session={!!session}
                    user={user}
                    askInput={askInput}
                    setAskInput={setAskInput}
                    onSubmit={handleAskSubmit}
                    totalQuestions={totalQuestions}
                    totalAnswers={totalAnswers}
                />

                {/* Stats Row */}
                {session && user && (
                    <StatsRow user={user} totalQuestions={totalQuestions} totalAnswers={totalAnswers} />
                )}

                {/* Feed Section */}
                <div className="mt-6">
                    {/* Feed Header */}
                    <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="flex size-5 items-center justify-center">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                    <path d="M8 1L10.2 5.5L15 6.2L11.5 9.6L12.4 14.4L8 12.1L3.6 14.4L4.5 9.6L1 6.2L5.8 5.5L8 1Z" fill="#a7c8b3" stroke="#a7c8b3" strokeWidth="0.5" strokeLinejoin="round"/>
                                </svg>
                            </div>
                            <span className="text-sm font-semibold text-zinc-100">Recommended for you</span>
                            <span className="text-xs text-zinc-500 hidden sm:inline">Based on your interests and activity</span>
                        </div>
                        <Link
                            href="/questions"
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                        >
                            <Settings2 className="size-3.5" />
                            Customize feed
                        </Link>
                    </div>

                    {/* Feed Tabs */}
                    <div className="mb-5 flex overflow-x-auto items-center border-b border-white/10 no-scrollbar">
                        {feedTabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => handleFilterChange(tab.id)}
                                className={cn(
                                    "relative whitespace-nowrap pb-3 pr-5 text-sm transition duration-200",
                                    activeFilter === tab.id
                                        ? "font-semibold text-zinc-100"
                                        : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                {tab.label}
                                {activeFilter === tab.id && (
                                    <motion.div
                                        layoutId="feed-tab-underline"
                                        className="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-[#a7c8b3]"
                                        transition={{ duration: 0.18, ease: "easeOut" }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Question Cards */}
                    <AnimatePresence mode="wait">
                        {displayedQuestions.length === 0 ? (
                            <EmptyState filter={activeFilter} />
                        ) : (
                            <motion.div
                                key={activeFilter}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.18, ease: "easeOut" }}
                                className="space-y-3"
                            >
                                {displayedQuestions.map((q) => (
                                    <QuestionCard key={q.$id} question={q} />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* View All */}
                    {displayedQuestions.length > 0 && (
                        <Link
                            href="/questions"
                            className="mt-5 flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] text-sm text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
                        >
                            View all questions
                            <ChevronRight className="size-4" />
                        </Link>
                    )}
                </div>
            </div>

            {/* ── Right Sidebar ── */}
            <aside className="hidden w-72 shrink-0 xl:block">
                {/* Community Highlights */}
                <CommunityHighlights contributors={communityHighlights} />

                {/* Trending Tags */}
                <TrendingTagsCard tags={trendingTags} />

                {/* Developer News */}
                <DeveloperNews news={developerNews} />
            </aside>
        </div>
    );
}

// ─── Hero Banner ──────────────────────────────────────────────────────────────

function HeroBanner({
    session,
    user,
    askInput,
    setAskInput,
    onSubmit,
    totalQuestions,
    totalAnswers,
}: {
    session: boolean;
    user: any;
    askInput: string;
    setAskInput: (v: string) => void;
    onSubmit: (e: React.FormEvent) => void;
    totalQuestions: number;
    totalAnswers: number;
}) {
    return (
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-white/10 bg-[#0a1410] min-h-[240px]">
            {/* Background Image with Gradient Fade */}
            <div className="absolute inset-y-0 right-0 w-full md:w-2/3 lg:w-[60%]">
                {/* Gradient mask to blend the image into the dark left side */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#0a1410] via-[#0a1410]/40 to-transparent z-10" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1410] via-transparent to-transparent z-10 md:hidden" />
                {/* User's uploaded image (should be placed in /public/images/hero-bg.png) */}
                <img 
                    src="/images/hero-bg.png" 
                    alt="Developer workspace" 
                    className="w-full h-full object-cover object-right opacity-100 transition-opacity duration-500" 
                    onError={(e) => {
                        // Fallback if the user hasn't added the image yet
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
            </div>

            {/* Content (Text + Form) */}
            <div className="relative z-20 flex flex-col justify-center p-6 md:p-8 max-w-xl lg:max-w-2xl min-h-[240px]">
                <h1 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
                    {session && user ? (
                        <>Hey <span className="text-[#a7c8b3]">{user.name.split(" ")[0]}</span> 👋</>
                    ) : (
                        <>Welcome to <span className="text-[#a7c8b3]">ByteNest</span> 👋</>
                    )}
                </h1>
                <p className="mt-2 text-sm text-zinc-300 max-w-sm sm:max-w-md">
                    Ask a question, share knowledge, and help developers around the world.
                </p>

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                    <Link
                        href="/questions/ask"
                        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-6 text-sm font-semibold text-[#08100b] shadow-[0_0_15px_rgba(167,200,179,0.15)] transition hover:bg-[#b4d6bf] hover:shadow-[0_0_20px_rgba(167,200,179,0.25)]"
                    >
                        Ask a Question
                    </Link>
                    <Link
                        href="/questions"
                        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-6 text-sm font-semibold text-zinc-100 backdrop-blur-md transition hover:bg-white/[0.1] hover:border-white/20"
                    >
                        Explore Questions
                    </Link>
                </div>
            </div>
        </div>
    );
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function StatsRow({ user, totalQuestions, totalAnswers }: { user: any; totalQuestions: number; totalAnswers: number }) {
    const stats = [
        {
            value: user?.prefs?.reputation ?? 0,
            label: "Reputation",
            sub: "Keep contributing!",
            icon: (
                <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="8" r="4" stroke="#a7c8b3" strokeWidth="1.5"/>
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#a7c8b3" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                </div>
            ),
        },
        {
            value: 1,
            label: "Questions",
            sub: "Keep asking!",
            icon: (
                <div className="flex size-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                    <MessageCircle className="size-5 text-blue-400" />
                </div>
            ),
        },
        {
            value: 0,
            label: "Answers",
            sub: "Help others grow!",
            icon: (
                <div className="flex size-10 items-center justify-center rounded-xl border border-purple-500/20 bg-purple-500/10">
                    <Send className="size-5 text-purple-400" />
                </div>
            ),
        },
        {
            value: 0,
            label: "Badges",
            sub: "Unlock achievements!",
            icon: (
                <div className="flex size-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10">
                    <Trophy className="size-5 text-amber-400" />
                </div>
            ),
        },
    ];

    return (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat, i) => (
                <motion.div
                    key={stat.label}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.06 }}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4 transition hover:bg-white/[0.04]"
                >
                    {stat.icon}
                    <div className="min-w-0">
                        <p className="truncate text-xl font-bold text-zinc-100">{stat.value}</p>
                        <p className="text-xs font-medium text-zinc-300">{stat.label}</p>
                        <p className="hidden text-[10px] text-zinc-600 sm:block">{stat.sub}</p>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────

function QuestionCard({ question }: { question: Question }) {
    const [bookmarked, setBookmarked] = React.useState(false);

    const excerpt = question.content
        .replace(/```[\s\S]*?```/g, "[code]")
        .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
        .replace(/[#*_>\[\]!]/g, "")
        .replace(/\n+/g, " ")
        .trim()
        .slice(0, 140);

    return (
        <motion.article
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="group rounded-xl border border-white/10 bg-white/[0.025] transition-[background,border-color] duration-200 hover:border-white/15 hover:bg-white/[0.04]"
        >
            <div className="flex gap-4 p-5">
                {/* Vote Controls */}
                <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                    <button className="flex size-7 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/10 hover:text-[#a7c8b3]">
                        <ArrowUp className="size-4" />
                    </button>
                    <span className={cn(
                        "text-sm font-bold",
                        question.totalVotes > 0 ? "text-[#a7c8b3]" : question.totalVotes < 0 ? "text-red-400" : "text-zinc-400"
                    )}>
                        {question.totalVotes}
                    </span>
                    <button className="flex size-7 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/10 hover:text-red-400">
                        <ArrowDown className="size-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                        <Link href={`/questions/${question.$id}/${slugify(question.title)}`}>
                            <h2 className="text-base font-semibold leading-snug text-zinc-100 transition group-hover:text-[#d3e7d8] sm:text-lg">
                                {question.title}
                            </h2>
                        </Link>
                        <button
                            onClick={() => setBookmarked(!bookmarked)}
                            className={cn(
                                "shrink-0 transition",
                                bookmarked ? "text-[#a7c8b3]" : "text-zinc-600 hover:text-zinc-300"
                            )}
                        >
                            <Bookmark className="size-4" fill={bookmarked ? "currentColor" : "none"} />
                        </button>
                    </div>

                    {excerpt && (
                        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                            {excerpt}
                        </p>
                    )}

                    {/* Tags */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {question.tags.slice(0, 4).map((tag) => (
                            <Link
                                key={tag}
                                href={`/questions?tag=${tag}`}
                                onClick={(e) => e.stopPropagation()}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-500 transition hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                            >
                                {tag}
                            </Link>
                        ))}
                    </div>

                    {/* Footer */}
                    <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        {/* Author */}
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                            <img
                                src={avatars.getInitials(question.author.name, 20, 20).href}
                                alt={question.author.name}
                                className="size-5 rounded-full"
                            />
                            <Link
                                href={`/users/${question.author.$id}/${slugify(question.author.name)}`}
                                className="font-medium text-zinc-400 transition hover:text-zinc-200"
                            >
                                {question.author.name}
                            </Link>
                            <span>·</span>
                            <span>asked {convertDateToRelativeTime(new Date(question.$createdAt))}</span>
                        </div>

                        {/* Answers count */}
                        <div className="flex items-center gap-1 text-xs text-zinc-500">
                            <MessageCircle className="size-3.5" />
                            <span className={cn(question.totalAnswers > 0 ? "text-[#a7c8b3]" : "")}>
                                {question.totalAnswers}
                            </span>
                            <span>answers</span>
                        </div>
                    </div>
                </div>
            </div>
        </motion.article>
    );
}

// ─── Community Highlights ─────────────────────────────────────────────────────

function CommunityHighlights({ contributors }: { contributors: { name: string; $id: string; reputation: number }[] }) {

    const highlights = [
        { label: "Top Contributor", sublabel: contributors[0]?.name ?? "victor-dev", value: `${(contributors[0]?.reputation ?? 2400).toLocaleString()} rep`, color: "text-blue-400", dotColor: "bg-blue-400" },
        { label: "Most Helpful Answer", sublabel: contributors[1]?.name ?? "sarah.dev", value: `${(contributors[1]?.reputation ?? 1500).toLocaleString()} rep`, color: "text-[#a7c8b3]", dotColor: "bg-[#a7c8b3]" },
        { label: "Rising Star", sublabel: contributors[2]?.name ?? "aryan231", value: `${(contributors[2]?.reputation ?? 300).toLocaleString()} rep`, color: "text-amber-400", dotColor: "bg-amber-400" },
    ];

    if (contributors.length === 0) return null;

    return (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="mb-4 flex items-center gap-2">
                <Trophy className="size-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Community Highlights</h3>
            </div>

            <div className="space-y-3">
                {highlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-xs font-bold text-zinc-200">
                            {h.sublabel.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-zinc-300">{h.label}</p>
                            <p className="flex items-center gap-1 text-[11px] text-zinc-500">
                                <span className={cn("inline-block size-1.5 rounded-full", h.dotColor)} />
                                <span className="truncate">{h.sublabel}</span>
                            </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-zinc-500">{h.value}</span>
                    </div>
                ))}
            </div>

            <Link
                href="/users"
                className="mt-4 flex items-center gap-1 text-xs font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
            >
                View leaderboard
                <ChevronRight className="size-3.5" />
            </Link>
        </div>
    );
}

// ─── Trending Tags ────────────────────────────────────────────────────────────

function TrendingTagsCard({ tags }: { tags: { tag: string; questions: number }[] }) {
    const fallbackTags = [
        { tag: "nextjs", questions: 2100 },
        { tag: "tailwindcss", questions: 1800 },
        { tag: "spring-boot", questions: 1500 },
        { tag: "docker", questions: 1200 },
        { tag: "typescript", questions: 1000 },
    ];

    const displayTags = tags.length > 0 ? tags : fallbackTags;

    return (
        <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="mb-4 flex items-center gap-2">
                <Flame className="size-4 text-orange-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Trending Tags</h3>
            </div>

            <div className="space-y-2.5">
                {displayTags.map(({ tag, questions }) => (
                    <Link
                        key={tag}
                        href={`/questions?tag=${tag}`}
                        className="group flex items-center justify-between text-sm"
                    >
                        <div className="flex items-center gap-2">
                            <Hash className="size-3.5 text-zinc-600 transition group-hover:text-[#a7c8b3]" />
                            <span className="text-zinc-300 transition group-hover:text-[#a7c8b3] max-w-[120px] truncate">{tag}</span>
                        </div>
                        <span className="text-xs text-zinc-600">
                            {questions >= 1000 ? `${(questions / 1000).toFixed(1)}k` : questions} questions
                        </span>
                    </Link>
                ))}
            </div>

            <Link
                href="/questions"
                className="mt-4 flex items-center gap-1 text-xs font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
            >
                Explore all trending tags
                <ChevronRight className="size-3.5" />
            </Link>
        </div>
    );
}

// ─── Developer News ───────────────────────────────────────────────────────────

function DeveloperNews({ news }: { news: { title: string; time: string; slug: string; $id: string; }[] }) {
    const fallbackNews = [
        { title: "Next.js 15 Release Candidate is out", time: "2d ago", slug: "nextjs-15", $id: "1" },
        { title: "TypeScript 5.4: What's new?", time: "3d ago", slug: "ts-5-4", $id: "2" },
        { title: "Rust 1.78 improves performance", time: "4d ago", slug: "rust-1-78", $id: "3" },
    ];

    const displayNews = news.length > 0 ? news : fallbackNews;

    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="mb-4 flex items-center gap-2">
                <Newspaper className="size-4 text-zinc-400" />
                <h3 className="text-sm font-semibold text-zinc-100">Developer News</h3>
            </div>

            <div className="space-y-3">
                {displayNews.map((item, i) => (
                    <Link key={item.$id} href={`/questions/${item.$id}/${item.slug}`} className="flex items-start justify-between gap-3 group">
                        <p className="text-xs leading-relaxed text-zinc-400 transition group-hover:text-zinc-200 line-clamp-2">
                            {item.title}
                        </p>
                        <span className="shrink-0 text-[10px] text-zinc-600 mt-0.5">{item.time}</span>
                    </Link>
                ))}
            </div>

            <Link
                href="/questions?tag=news"
                className="mt-4 flex items-center gap-1 text-xs font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
            >
                View all news
                <ChevronRight className="size-3.5" />
            </Link>
        </div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] py-16 text-center"
        >
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <MessageCircle className="size-6 text-zinc-500" />
            </div>
            <h3 className="text-base font-semibold text-zinc-200">
                {filter === "Unanswered" ? "All questions answered!" : "No questions yet"}
            </h3>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
                {filter === "Unanswered"
                    ? "Great work, community! Every question has at least one answer."
                    : "Be the first to ask a question and start the conversation."}
            </p>
            <Link
                href="/questions/ask"
                className="mt-5 flex h-9 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-4 text-sm font-medium text-[#08100b] transition hover:bg-[#b4d6bf]"
            >
                <Plus className="size-4" />
                Ask a question
            </Link>
        </motion.div>
    );
}
