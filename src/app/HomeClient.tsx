// src/app/HomeClient.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
    Bookmark,
    Clock3,
    Flame,
    HomeIcon,
    MessageSquare,
    Plus,
    Search,
    Tags,
    UserRound,
    ArrowUp,
    MessageCircle,
    Hash,
    TrendingUp,
    Users,
    Zap,
    ChevronRight,
    Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";
import { useAuthStore } from "@/store/Auth";

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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const sidebarItems = [
    { label: "Home", icon: HomeIcon, href: "/", active: true },
    { label: "Questions", icon: Tags, href: "/questions" },
    { label: "Profile", icon: UserRound, href: "/users" },
    { label: "Bookmarks", icon: Bookmark, href: "#" },
];

const filters = [
    { label: "Newest", icon: Clock3 },
    { label: "Trending", icon: Flame },
    { label: "Unanswered", icon: MessageSquare },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function HomeClient({ questions, totalQuestions, totalAnswers, initialFilter }: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { user, session } = useAuthStore();

    const [activeFilter, setActiveFilter] = React.useState(initialFilter);
    const [isTransitioning, setIsTransitioning] = React.useState(false);
    const [searchValue, setSearchValue] = React.useState("");

    const handleFilterChange = (filter: string) => {
        if (filter === activeFilter) return;
        setActiveFilter(filter);
        setIsTransitioning(true);
        const p = new URLSearchParams(searchParams.toString());
        p.set("filter", filter);
        router.push(`${pathname}?${p.toString()}`);
        setTimeout(() => setIsTransitioning(false), 300);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchValue.trim()) {
            router.push(`/questions?search=${encodeURIComponent(searchValue.trim())}`);
        }
    };

    // Client-side sort for Trending/Unanswered on current fetched data
    const displayedQuestions = React.useMemo(() => {
        let q = [...questions];
        if (activeFilter === "Trending") q.sort((a, b) => b.totalVotes - a.totalVotes);
        if (activeFilter === "Unanswered") q = q.filter((q) => q.totalAnswers === 0);
        return q;
    }, [questions, activeFilter]);

    // Collect all unique tags from questions for the sidebar
    const popularTags = React.useMemo(() => {
        const freq: Record<string, number> = {};
        questions.forEach((q) => q.tags.forEach((t) => (freq[t] = (freq[t] || 0) + 1)));
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 6);
    }, [questions]);

    return (
        <div className="min-h-screen bg-[#080808] text-zinc-100">
            {/* ── Top Nav ── */}
            <TopNav
                searchValue={searchValue}
                onSearchChange={setSearchValue}
                onSearchSubmit={handleSearch}
                session={!!session}
            />

            <div className="mx-auto flex max-w-[1440px]">
                {/* ── Desktop Sidebar ── */}
                <aside className="fixed left-0 top-16 hidden h-[calc(100vh-4rem)] w-60 border-r border-white/10 bg-[#080808] px-4 py-6 lg:block">
                    <nav className="space-y-1">
                        {sidebarItems.map((item) => {
                            const Icon = item.icon;
                            const href = item.label === "Profile" && user
                                ? `/users/${user.$id}/${slugify(user.name)}`
                                : item.href;
                            return (
                                <Link
                                    key={item.label}
                                    href={href}
                                    className={cn(
                                        "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm transition duration-200 hover:bg-white/[0.05] hover:text-zinc-100",
                                        item.active
                                            ? "border border-white/10 bg-white/[0.07] text-zinc-100"
                                            : "text-zinc-500"
                                    )}
                                >
                                    <Icon className={cn("size-4", item.active && "text-[#a7c8b3]")} />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Live Stats */}
                    <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                            Community
                        </p>
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1.5 text-zinc-500">
                                    <MessageSquare className="size-3 text-[#a7c8b3]/70" />
                                    Questions
                                </span>
                                <span className="font-semibold text-zinc-300">{totalQuestions.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="flex items-center gap-1.5 text-zinc-500">
                                    <Zap className="size-3 text-[#a7c8b3]/70" />
                                    Answers
                                </span>
                                <span className="font-semibold text-zinc-300">{totalAnswers.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Popular Tags */}
                    {popularTags.length > 0 && (
                        <div className="mt-6">
                            <p className="mb-2.5 px-1 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                                Trending Tags
                            </p>
                            {popularTags.map(([tag, count]) => (
                                <Link
                                    key={tag}
                                    href={`/questions?tag=${tag}`}
                                    className="flex h-8 items-center justify-between gap-2 rounded-lg px-3 text-xs text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
                                >
                                    <span className="flex items-center gap-2">
                                        <Hash className="size-3 text-[#a7c8b3]/60" />
                                        {tag}
                                    </span>
                                    <span className="text-zinc-700">{count}×</span>
                                </Link>
                            ))}
                        </div>
                    )}
                </aside>

                {/* ── Main Content ── */}
                <main className="w-full px-4 pb-20 pt-8 md:px-8 lg:ml-60 lg:px-12">
                    <div className="mx-auto max-w-4xl">

                        {/* ── Hero Banner ── */}
                        <HeroBanner session={!!session} totalQuestions={totalQuestions} totalAnswers={totalAnswers} />

                        {/* ── Section Header ── */}
                        <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-sm font-medium text-[#a7c8b3]">Home</p>
                                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl">
                                    Latest Questions
                                </h2>
                                <p className="mt-1 text-sm text-zinc-500">
                                    {totalQuestions.toLocaleString()} total across the community
                                </p>
                            </div>

                            {/* Filter Tabs */}
                            <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                                {filters.map((f) => (
                                    <FilterTab
                                        key={f.label}
                                        filter={f}
                                        isActive={activeFilter === f.label}
                                        onClick={() => handleFilterChange(f.label)}
                                    />
                                ))}
                            </div>
                        </section>

                        {/* ── Question List ── */}
                        <section className="space-y-3">
                            <AnimatePresence initial={false} mode="wait">
                                {isTransitioning ? (
                                    <motion.div
                                        key="skeletons"
                                        className="space-y-3"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.15 }}
                                    >
                                        {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
                                    </motion.div>
                                ) : displayedQuestions.length === 0 ? (
                                    <EmptyState filter={activeFilter} />
                                ) : (
                                    <motion.div
                                        key={activeFilter}
                                        className="space-y-3"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        transition={{ duration: 0.18, ease: "easeOut" }}
                                    >
                                        {displayedQuestions.map((q) => (
                                            <QuestionCard key={q.$id} question={q} />
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </section>

                        {/* ── View All CTA ── */}
                        {displayedQuestions.length > 0 && (
                            <motion.div
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="mt-6 flex justify-center"
                            >
                                <Link
                                    href="/questions"
                                    className="group flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-zinc-400 transition duration-200 hover:border-[#a7c8b3]/30 hover:bg-white/[0.07] hover:text-zinc-100"
                                >
                                    View all questions
                                    <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
                                </Link>
                            </motion.div>
                        )}
                    </div>
                </main>
            </div>

            {/* ── Mobile Bottom Nav ── */}
            <MobileNav user={user} />
        </div>
    );
}

// ─── Hero Banner ──────────────────────────────────────────────────────────────

function HeroBanner({
    session,
    totalQuestions,
    totalAnswers,
}: {
    session: boolean;
    totalQuestions: number;
    totalAnswers: number;
}) {
    if (session) {
        // Logged-in: compact welcome strip
        return (
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-[#a7c8b3]/15 bg-[#a7c8b3]/[0.04] px-5 py-4"
            >
                <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-[#a7c8b3]/15">
                        <Star className="size-4 text-[#a7c8b3]" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold text-zinc-100">Welcome back to ByteNest</p>
                        <p className="text-xs text-zinc-500">
                            {totalQuestions.toLocaleString()} questions · {totalAnswers.toLocaleString()} answers
                        </p>
                    </div>
                </div>
                <Link
                    href="/questions/ask"
                    className="flex h-9 shrink-0 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-4 text-sm font-medium text-[#08100b] transition hover:bg-[#b4d6bf]"
                >
                    <Plus className="size-4" />
                    Ask question
                </Link>
            </motion.div>
        );
    }

    // Logged-out: full hero
    return (
        <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-[#0f1f14] via-[#080808] to-[#080808] p-8 md:p-10"
        >
            {/* Glow */}
            <div className="pointer-events-none absolute -top-24 left-1/4 size-72 rounded-full bg-[#a7c8b3]/10 blur-3xl" />

            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="max-w-lg">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-3 py-1 text-xs font-medium text-[#a7c8b3]">
                        <Zap className="size-3" />
                        Developer Q&A Community
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
                        Where developers
                        <br />
                        <span className="bg-gradient-to-r from-[#a7c8b3] to-emerald-400 bg-clip-text text-transparent">
                            ask, share & grow
                        </span>
                    </h1>
                    <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                        Join a community of curious minds. Get answers to your toughest coding
                        questions and share your knowledge.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                        <Link
                            href="/register"
                            className="flex h-10 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-5 text-sm font-semibold text-[#08100b] transition hover:bg-[#b4d6bf]"
                        >
                            Get started free
                            <ChevronRight className="size-4" />
                        </Link>
                        <Link
                            href="/questions"
                            className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-zinc-300 transition hover:bg-white/[0.08] hover:text-zinc-100"
                        >
                            Browse questions
                        </Link>
                    </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3 md:shrink-0">
                    {[
                        { label: "Questions", value: totalQuestions, icon: <MessageSquare className="size-4" /> },
                        { label: "Answers", value: totalAnswers, icon: <Zap className="size-4" /> },
                        { label: "Community", value: "Open", icon: <Users className="size-4" /> },
                        { label: "Live", value: "Always", icon: <TrendingUp className="size-4" /> },
                    ].map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                        >
                            <div className="mb-1 flex items-center gap-1.5 text-[#a7c8b3]/70">
                                {stat.icon}
                                <span className="text-xs text-zinc-500">{stat.label}</span>
                            </div>
                            <p className="text-xl font-bold text-zinc-100">
                                {typeof stat.value === "number"
                                    ? stat.value.toLocaleString()
                                    : stat.value}
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}

// ─── TopNav ───────────────────────────────────────────────────────────────────

function TopNav({
    searchValue,
    onSearchChange,
    onSearchSubmit,
    session,
}: {
    searchValue: string;
    onSearchChange: (v: string) => void;
    onSearchSubmit: (e: React.FormEvent) => void;
    session: boolean;
}) {
    return (
        <header className="sticky top-0 z-50 h-16 border-b border-white/10 bg-[#080808]/85 backdrop-blur-xl">
            <div className="mx-auto grid h-full max-w-[1440px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 md:gap-6 md:px-6 lg:grid-cols-[240px_minmax(320px,720px)_auto]">
                <Link href="/" className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-[#a7c8b3]">
                        B
                    </span>
                    <span className="hidden text-sm font-semibold text-zinc-100 sm:inline">
                        ByteNest
                    </span>
                </Link>

                <form onSubmit={onSearchSubmit} className="relative mx-auto w-full max-w-2xl">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                        aria-label="Search questions"
                        placeholder="Search questions, tags, or authors…"
                        value={searchValue}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-none transition duration-200 ease-out hover:border-white/15 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                    />
                </form>

                <Button
                    asChild
                    className="h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-3 text-sm font-medium text-[#08100b] shadow-none transition duration-200 ease-out hover:bg-[#b4d6bf] md:px-4"
                >
                    <Link href={session ? "/questions/ask" : "/login"}>
                        <Plus className="size-4" />
                        <span className="hidden sm:inline">
                            {session ? "Ask Question" : "Sign In"}
                        </span>
                    </Link>
                </Button>
            </div>
        </header>
    );
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────

function QuestionCard({ question }: { question: Question }) {
    const excerpt = question.content
        .replace(/```[\s\S]*?```/g, "[code block]")
        .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
        .replace(/[#*_>\[\]!]/g, "")
        .replace(/\n+/g, " ")
        .trim()
        .slice(0, 160);

    return (
        <Link href={`/questions/${question.$id}/${slugify(question.title)}`}>
            <motion.article
                whileHover={{ y: -2 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="group rounded-xl border border-white/10 bg-white/[0.035] p-5 transition-[background,border-color] duration-200 ease-out hover:border-white/15 hover:bg-white/[0.055]"
            >
                <div className="flex flex-col gap-5 sm:flex-row">
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2 text-sm sm:w-24 sm:grid-cols-1">
                        <StatBadge
                            value={question.totalVotes}
                            label="votes"
                            emphasized={question.totalVotes > 0}
                        />
                        <StatBadge
                            value={question.totalAnswers}
                            label="answers"
                            emphasized={question.totalAnswers > 0}
                        />
                    </div>

                    {/* Body */}
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold leading-snug tracking-normal text-zinc-50 transition duration-200 ease-out group-hover:text-[#d3e7d8] sm:text-xl">
                            {question.title}
                        </h2>
                        {excerpt && (
                            <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-zinc-400">
                                {excerpt}
                            </p>
                        )}

                        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="flex flex-wrap gap-2">
                                {question.tags.slice(0, 4).map((tag) => (
                                    <span
                                        key={tag}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            window.location.href = `/questions?tag=${tag}`;
                                        }}
                                        className="cursor-pointer rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-400 transition hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            <div className="flex shrink-0 items-center gap-2 text-sm text-zinc-500">
                                <span className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[11px] font-semibold text-zinc-200">
                                    {question.author.name.slice(0, 2).toUpperCase()}
                                </span>
                                <span className="font-medium text-zinc-300">
                                    {question.author.name}
                                </span>
                                <span className="text-zinc-600">/</span>
                                <span>{convertDateToRelativeTime(new Date(question.$createdAt))}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.article>
        </Link>
    );
}

// ─── StatBadge ────────────────────────────────────────────────────────────────

function StatBadge({ value, label, emphasized }: { value: number; label: string; emphasized?: boolean }) {
    return (
        <div
            className={cn(
                "rounded-xl border border-white/10 bg-black/20 px-3 py-2",
                emphasized && "border-[#a7c8b3]/25 bg-[#a7c8b3]/10"
            )}
        >
            <p className="text-base font-semibold text-zinc-100">{value}</p>
            <p className="text-xs text-zinc-500">{label}</p>
        </div>
    );
}

// ─── FilterTab ────────────────────────────────────────────────────────────────

function FilterTab({
    filter,
    isActive,
    onClick,
}: {
    filter: (typeof filters)[number];
    isActive: boolean;
    onClick: () => void;
}) {
    const Icon = filter.icon;
    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-zinc-500 transition duration-200 ease-out hover:text-zinc-100",
                isActive && "text-zinc-950"
            )}
        >
            {isActive && (
                <motion.span
                    layoutId="home-active-filter"
                    className="absolute inset-0 rounded-lg bg-[#a7c8b3]"
                    transition={{ duration: 0.18, ease: "easeOut" }}
                />
            )}
            <Icon className="relative size-4" />
            <span className="relative hidden sm:inline">{filter.label}</span>
        </button>
    );
}

// ─── MobileNav ────────────────────────────────────────────────────────────────

function MobileNav({ user }: { user: any }) {
    return (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-2xl border border-white/10 bg-[#101010]/90 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden">
            {sidebarItems.map((item) => {
                const Icon = item.icon;
                const href = item.label === "Profile" && user
                    ? `/users/${user.$id}/${slugify(user.name)}`
                    : item.href;
                return (
                    <Link
                        key={item.label}
                        href={href}
                        aria-label={item.label}
                        className={cn(
                            "flex size-10 items-center justify-center rounded-xl text-zinc-500 transition duration-200 ease-out hover:bg-white/[0.06] hover:text-zinc-100",
                            item.active && "bg-white/[0.08] text-[#a7c8b3]"
                        )}
                    >
                        <Icon className="size-4" />
                    </Link>
                );
            })}
        </div>
    );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ filter }: { filter: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] py-20 text-center"
        >
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <MessageCircle className="size-6 text-zinc-500" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-200">
                {filter === "Unanswered" ? "All questions answered!" : "No questions yet"}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
                {filter === "Unanswered"
                    ? "Great work, community! Every question has at least one answer."
                    : "Be the first to ask a question and start the conversation."}
            </p>
            <Button
                asChild
                className="mt-6 h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-5 text-sm font-medium text-[#08100b] shadow-none hover:bg-[#b4d6bf]"
            >
                <Link href="/questions/ask">
                    <Plus className="size-4" />
                    Ask a question
                </Link>
            </Button>
        </motion.div>
    );
}

// ─── CardSkeleton ─────────────────────────────────────────────────────────────

function CardSkeleton() {
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.055] p-5">
            <div className="flex flex-col gap-5 sm:flex-row">
                <div className="grid grid-cols-2 gap-2 sm:w-24 sm:grid-cols-1">
                    <Skeleton className="h-[62px] rounded-xl bg-white/[0.16]" />
                    <Skeleton className="h-[62px] rounded-xl bg-white/[0.16]" />
                </div>
                <div className="flex-1">
                    <Skeleton className="h-6 w-4/5 rounded-lg bg-white/[0.16]" />
                    <Skeleton className="mt-3 h-4 w-full rounded-lg bg-white/[0.12]" />
                    <Skeleton className="mt-2 h-4 w-2/3 rounded-lg bg-white/[0.12]" />
                    <div className="mt-5 flex items-center justify-between gap-4">
                        <div className="flex gap-2">
                            <Skeleton className="h-7 w-20 rounded-full bg-white/[0.14]" />
                            <Skeleton className="h-7 w-24 rounded-full bg-white/[0.14]" />
                        </div>
                        <Skeleton className="h-8 w-36 rounded-full bg-white/[0.14]" />
                    </div>
                </div>
            </div>
        </div>
    );
}
