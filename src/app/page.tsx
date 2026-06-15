"use client";

import Link from "next/link";
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
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const sidebarItems = [
    { label: "Home", icon: HomeIcon, active: true },
    { label: "Tags", icon: Tags },
    { label: "Profile", icon: UserRound },
    { label: "Bookmarks", icon: Bookmark },
];

const filters = [
    { label: "Newest", icon: Clock3 },
    { label: "Trending", icon: Flame },
    { label: "Unanswered", icon: MessageSquare },
];

const questions = [
    {
        id: "server-actions-cache-boundary",
        title: "How should I structure cache boundaries for Next.js Server Actions?",
        excerpt:
            "I am moving a dashboard from API routes to Server Actions and want a clear pattern for invalidating question feeds without creating stale UI states.",
        tags: ["next.js", "server-actions", "cache"],
        votes: 42,
        answers: 6,
        author: "Maya Chen",
        initials: "MC",
        time: "18 min ago",
        trend: "Trending",
    },
    {
        id: "typescript-zod-enums",
        title: "Best way to keep TypeScript unions and Zod enums in sync?",
        excerpt:
            "The app has shared validation across forms and route handlers. I would like the schema to remain the source of truth without repeating literal values.",
        tags: ["typescript", "zod", "validation"],
        votes: 31,
        answers: 4,
        author: "Jon Bell",
        initials: "JB",
        time: "47 min ago",
        trend: "Newest",
    },
    {
        id: "postgres-jsonb-indexes",
        title: "When does a JSONB GIN index stop being worth it in Postgres?",
        excerpt:
            "Our metadata column is flexible, but the query planner is inconsistent once filters combine JSONB keys with a tenant scope and created-at sort.",
        tags: ["postgresql", "jsonb", "indexes"],
        votes: 28,
        answers: 0,
        author: "Ari Singh",
        initials: "AS",
        time: "1 hour ago",
        trend: "Unanswered",
    },
    {
        id: "react-query-optimistic-updates",
        title: "How do you keep optimistic updates readable in React Query?",
        excerpt:
            "Nested mutation callbacks work, but the rollback logic is getting difficult to scan. I am looking for a calmer composition pattern.",
        tags: ["react", "tanstack-query", "architecture"],
        votes: 19,
        answers: 3,
        author: "Nora Silva",
        initials: "NS",
        time: "2 hours ago",
        trend: "Newest",
    },
    {
        id: "tailwind-design-tokens",
        title: "Should product design tokens live in Tailwind config or CSS variables?",
        excerpt:
            "We need themeable surfaces, chart colors, and component states. Tailwind is convenient, but CSS variables feel more portable.",
        tags: ["tailwind-css", "design-system", "css"],
        votes: 15,
        answers: 0,
        author: "Theo Martin",
        initials: "TM",
        time: "3 hours ago",
        trend: "Unanswered",
    },
];

export default function Home() {
    const [activeFilter, setActiveFilter] = React.useState("Newest");
    const [isFiltering, setIsFiltering] = React.useState(false);

    const visibleQuestions = React.useMemo(() => {
        if (activeFilter === "Trending") {
            return [...questions].sort((a, b) => b.votes - a.votes);
        }

        if (activeFilter === "Unanswered") {
            return questions.filter(question => question.answers === 0);
        }

        return questions;
    }, [activeFilter]);

    const handleFilterChange = (filter: string) => {
        if (filter === activeFilter) return;

        setActiveFilter(filter);
        setIsFiltering(true);
        window.setTimeout(() => setIsFiltering(false), 220);
    };

    return (
        <div className="min-h-screen bg-[#080808] text-zinc-100">
            <TopNavigation />
            <div className="mx-auto flex max-w-[1440px]">
                <Sidebar />
                <MobileSidebar />

                <main className="w-full px-4 pb-14 pt-8 md:px-8 lg:ml-60 lg:px-12">
                    <div className="mx-auto flex max-w-4xl flex-col gap-6">
                        <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <p className="text-sm font-medium text-[#a7c8b3]">Home</p>
                                <h1 className="mt-2 text-3xl font-semibold tracking-normal text-zinc-50 sm:text-4xl">
                                    Questions
                                </h1>
                            </div>

                            <div className="relative inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                                {filters.map(filter => (
                                    <FilterTab
                                        key={filter.label}
                                        filter={filter}
                                        isActive={activeFilter === filter.label}
                                        onClick={() => handleFilterChange(filter.label)}
                                    />
                                ))}
                            </div>
                        </section>

                        <section className="space-y-3">
                            <AnimatePresence initial={false}>
                                {isFiltering ? (
                                    <motion.div
                                        key="skeletons"
                                        className="space-y-3"
                                        initial={{ opacity: 0, y: 6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        transition={{ duration: 0.18, ease: "easeOut" }}
                                    >
                                        {Array.from({ length: 3 }).map((_, index) => (
                                            <QuestionCardSkeleton key={index} />
                                        ))}
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key={activeFilter}
                                        className="space-y-3"
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        transition={{ duration: 0.18, ease: "easeOut" }}
                                    >
                                        {visibleQuestions.map(question => (
                                            <QuestionCard key={question.id} question={question} />
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}

function TopNavigation() {
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

                <div className="relative mx-auto w-full max-w-2xl">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                        aria-label="Search questions"
                        placeholder="Search questions, tags, or authors"
                        className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-none transition duration-200 ease-out hover:border-white/15 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                    />
                </div>

                <Button
                    asChild
                    className="h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-3 text-sm font-medium text-[#08100b] shadow-none transition duration-200 ease-out hover:bg-[#b4d6bf] md:px-4"
                >
                    <Link href="/questions/ask">
                        <Plus className="size-4" />
                        <span className="hidden sm:inline">Ask Question</span>
                    </Link>
                </Button>
            </div>
        </header>
    );
}

function Sidebar() {
    return (
        <aside className="fixed left-0 top-16 hidden h-[calc(100vh-4rem)] w-60 border-r border-white/10 bg-[#080808] px-4 py-6 lg:block">
            <nav className="space-y-1">
                {sidebarItems.map(item => (
                    <SidebarItem key={item.label} item={item} />
                ))}
            </nav>
        </aside>
    );
}

function MobileSidebar() {
    return (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-2xl border border-white/10 bg-[#101010]/90 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden">
            {sidebarItems.map(item => {
                const Icon = item.icon;

                return (
                    <button
                        key={item.label}
                        aria-label={item.label}
                        className={cn(
                            "flex size-10 items-center justify-center rounded-xl text-zinc-500 transition duration-200 ease-out hover:bg-white/[0.06] hover:text-zinc-100",
                            item.active && "bg-white/[0.08] text-[#a7c8b3]"
                        )}
                    >
                        <Icon className="size-4" />
                    </button>
                );
            })}
        </div>
    );
}

function SidebarItem({
    item,
}: {
    item: (typeof sidebarItems)[number];
}) {
    const Icon = item.icon;

    return (
        <button
            className={cn(
                "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-zinc-500 transition duration-200 ease-out hover:bg-white/[0.05] hover:text-zinc-100",
                item.active && "border border-white/10 bg-white/[0.07] text-zinc-100"
            )}
        >
            <Icon className={cn("size-4", item.active && "text-[#a7c8b3]")} />
            <span>{item.label}</span>
        </button>
    );
}

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
                    layoutId="active-filter"
                    className="absolute inset-0 rounded-lg bg-[#a7c8b3]"
                    transition={{ duration: 0.18, ease: "easeOut" }}
                />
            )}
            <Icon className="relative size-4" />
            <span className="relative hidden sm:inline">{filter.label}</span>
        </button>
    );
}

function QuestionCard({
    question,
}: {
    question: (typeof questions)[number];
}) {
    return (
        <Link href={`/questions/${question.id}`}>
            <motion.article
                whileHover={{ y: -2 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="group rounded-xl border border-white/10 bg-white/[0.035] p-5 transition-[background,border-color] duration-200 ease-out hover:border-white/15 hover:bg-white/[0.055]"
            >
                <div className="flex flex-col gap-5 sm:flex-row">
                    <div className="grid grid-cols-2 gap-2 text-sm sm:w-24 sm:grid-cols-1">
                        <Metric label="votes" value={question.votes} />
                        <Metric label="answers" value={question.answers} emphasized={question.answers > 0} />
                    </div>

                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold leading-snug tracking-normal text-zinc-50 transition duration-200 ease-out group-hover:text-[#d3e7d8] sm:text-xl">
                            {question.title}
                        </h2>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">
                            {question.excerpt}
                        </p>

                        <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                            <div className="flex flex-wrap gap-2">
                                {question.tags.map(tag => (
                                    <span
                                        key={tag}
                                        className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-zinc-400"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 text-sm text-zinc-500">
                                <span className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[11px] font-semibold text-zinc-200">
                                    {question.initials}
                                </span>
                                <span className="font-medium text-zinc-300">{question.author}</span>
                                <span aria-hidden="true">/</span>
                                <span>{question.time}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.article>
        </Link>
    );
}

function Metric({
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
                "rounded-xl border border-white/10 bg-black/20 px-3 py-2",
                emphasized && "border-[#a7c8b3]/25 bg-[#a7c8b3]/10"
            )}
        >
            <p className="text-base font-semibold text-zinc-100">{value}</p>
            <p className="text-xs text-zinc-500">{label}</p>
        </div>
    );
}

function QuestionCardSkeleton() {
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
                            <Skeleton className="hidden h-7 w-16 rounded-full bg-white/[0.14] sm:block" />
                        </div>
                        <Skeleton className="h-8 w-36 rounded-full bg-white/[0.14]" />
                    </div>
                </div>
            </div>
        </div>
    );
}
