"use client";

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowUp,
    ArrowDown,
    MessageCircle,
    Search,
    Plus,
    HomeIcon,
    Tags,
    UserRound,
    Bookmark,
    ChevronLeft,
    ChevronRight,
    SortAsc,
    Calendar,
    TrendingUp,
    Filter,
    ExternalLink,
    Hash,
    Clock,
    Award,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnswerItem {
    $id: string;
    content: string;
    $createdAt: string;
    authorId: string;
    questionId: string;
    questionTitle: string;
    questionTags: string[];
    totalVotes: number;
    voteStatus: "upvoted" | "downvoted" | null; // current user's vote, if any
}

interface Props {
    answers: AnswerItem[];
    total: number;
    currentPage: number;
    limit: number;
    profileName: string;
    userId: string;
    userSlug: string;
}

type SortMode = "newest" | "oldest" | "most-voted";

const sidebarItems = [
    { label: "Home", icon: HomeIcon, href: "/" },
    { label: "Questions", icon: Tags, href: "/questions" },
    { label: "Profile", icon: UserRound, href: "#" },
    { label: "Bookmarks", icon: Bookmark, href: "#" },
];

const SORT_OPTIONS: { id: SortMode; label: string; icon: React.ReactNode }[] = [
    { id: "newest", label: "Newest", icon: <Clock className="size-3.5" /> },
    { id: "oldest", label: "Oldest", icon: <Calendar className="size-3.5" /> },
    { id: "most-voted", label: "Most Voted", icon: <TrendingUp className="size-3.5" /> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AnswersClient({
    answers,
    total,
    currentPage,
    limit,
    profileName,
    userId,
    userSlug,
}: Props) {
    const [search, setSearch] = React.useState("");
    const [sortMode, setSortMode] = React.useState<SortMode>("newest");
    const [expandedId, setExpandedId] = React.useState<string | null>(null);

    const totalPages = Math.ceil(total / limit);

    // client-side sort + search on current page's data
    const displayed = React.useMemo(() => {
        let items = [...answers];

        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(
                (a) =>
                    a.questionTitle.toLowerCase().includes(q) ||
                    a.content.toLowerCase().includes(q) ||
                    a.questionTags.some((t) => t.toLowerCase().includes(q))
            );
        }

        if (sortMode === "newest") {
            items.sort((a, b) => new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime());
        } else if (sortMode === "oldest") {
            items.sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime());
        } else if (sortMode === "most-voted") {
            items.sort((a, b) => b.totalVotes - a.totalVotes);
        }

        return items;
    }, [answers, search, sortMode]);

    // Stats
    const upvotedCount = answers.filter((a) => a.totalVotes > 0).length;
    const avgVotes =
        answers.length > 0
            ? (answers.reduce((s, a) => s + a.totalVotes, 0) / answers.length).toFixed(1)
            : "0";

    const navigate = (page: number) => {
        const url = new URL(window.location.href);
        url.searchParams.set("page", String(page));
        window.location.href = url.toString();
    };

    return (
        <div className="min-h-screen bg-[#080808] text-zinc-100">
            <TopNav />

            <div className="mx-auto flex max-w-[1440px]">
                {/* Sidebar */}
                <aside className="fixed left-0 top-16 hidden h-[calc(100vh-4rem)] w-60 border-r border-white/10 bg-[#080808] px-4 py-6 lg:block">
                    <nav className="space-y-1">
                        {sidebarItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-zinc-500 transition duration-200 hover:bg-white/[0.05] hover:text-zinc-100"
                                >
                                    <Icon className="size-4" />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Quick stats card */}
                    <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                            Answer Stats
                        </p>
                        <div className="space-y-2.5">
                            <StatRow label="Total answers" value={String(total)} />
                            <StatRow label="Avg. votes" value={avgVotes} />
                            <StatRow label="Positively voted" value={String(upvotedCount)} />
                        </div>
                    </div>

                    {/* Back to profile */}
                    <div className="mt-4">
                        <Link
                            href={`/users/${userId}/${userSlug}`}
                            className="flex h-9 w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs text-zinc-500 transition hover:bg-white/[0.07] hover:text-zinc-300"
                        >
                            <ChevronLeft className="size-3.5" />
                            Back to profile
                        </Link>
                    </div>
                </aside>

                {/* Main */}
                <main className="w-full px-4 pb-24 pt-8 md:px-8 lg:ml-60 lg:px-12">
                    <div className="mx-auto max-w-4xl">

                        {/* Page header */}
                        <div className="mb-6">
                            <div className="flex items-center gap-2 text-sm text-zinc-500">
                                <Link href={`/users/${userId}/${userSlug}`} className="hover:text-zinc-300 transition">
                                    {profileName}
                                </Link>
                                <span>/</span>
                                <span className="text-zinc-300">Answers</span>
                            </div>
                            <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                                        Answers
                                    </h1>
                                    <p className="mt-1 text-sm text-zinc-500">
                                        {total.toLocaleString()} answer{total !== 1 ? "s" : ""} by {profileName}
                                    </p>
                                </div>

                                {/* Sort tabs */}
                                <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                                    {SORT_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setSortMode(opt.id)}
                                            className={cn(
                                                "relative flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition duration-200",
                                                sortMode === opt.id
                                                    ? "text-zinc-950"
                                                    : "text-zinc-500 hover:text-zinc-300"
                                            )}
                                        >
                                            {sortMode === opt.id && (
                                                <motion.span
                                                    layoutId="answer-sort-pill"
                                                    className="absolute inset-0 rounded-lg bg-[#a7c8b3]"
                                                    transition={{ duration: 0.18, ease: "easeOut" }}
                                                />
                                            )}
                                            <span className="relative">{opt.icon}</span>
                                            <span className="relative hidden sm:inline">{opt.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Search bar */}
                        <div className="mb-5 relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Filter by question, content or tag…"
                                className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-none transition hover:border-white/15 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300 transition"
                                >
                                    clear
                                </button>
                            )}
                        </div>

                        {/* Summary strip */}
                        {search && (
                            <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                                <Filter className="size-3.5 text-zinc-500" />
                                <span className="text-sm text-zinc-400">
                                    Showing{" "}
                                    <span className="font-medium text-zinc-200">{displayed.length}</span> of{" "}
                                    {answers.length} results for{" "}
                                    <span className="font-medium text-zinc-200">&ldquo;{search}&rdquo;</span>
                                </span>
                            </div>
                        )}

                        {/* Answer list */}
                        <AnimatePresence mode="wait">
                            {displayed.length === 0 ? (
                                <EmptyState search={search} />
                            ) : (
                                <motion.div
                                    key={`${sortMode}-${search}`}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.18, ease: "easeOut" }}
                                    className="space-y-3"
                                >
                                    {displayed.map((answer, i) => (
                                        <AnswerCard
                                            key={answer.$id}
                                            answer={answer}
                                            index={i}
                                            isExpanded={expandedId === answer.$id}
                                            onToggleExpand={() =>
                                                setExpandedId(expandedId === answer.$id ? null : answer.$id)
                                            }
                                        />
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={navigate}
                            />
                        )}
                    </div>
                </main>
            </div>

            {/* Mobile bottom nav */}
            <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-2xl border border-white/10 bg-[#101010]/90 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden">
                {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="flex size-10 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
                        >
                            <Icon className="size-4" />
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

// ─── AnswerCard ───────────────────────────────────────────────────────────────

function AnswerCard({
    answer,
    index,
    isExpanded,
    onToggleExpand,
}: {
    answer: AnswerItem;
    index: number;
    isExpanded: boolean;
    onToggleExpand: () => void;
}) {
    // Strip markdown for preview text
    const plainText = answer.content
        .replace(/```[\s\S]*?```/g, "[code block]")
        .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
        .replace(/[#*_>\[\]!]/g, "")
        .replace(/\n+/g, " ")
        .trim();

    const isLong = plainText.length > 220;
    const preview = isLong && !isExpanded ? plainText.slice(0, 220) + "…" : plainText;

    const voteColor =
        answer.totalVotes > 0
            ? "border-[#a7c8b3]/25 bg-[#a7c8b3]/10 text-[#a7c8b3]"
            : answer.totalVotes < 0
            ? "border-red-400/25 bg-red-400/10 text-red-400"
            : "border-white/10 bg-black/20 text-zinc-400";

    return (
        <motion.article
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.035 }}
            className="group rounded-xl border border-white/10 bg-white/[0.025] p-5 transition-[background,border-color] duration-200 hover:border-white/15 hover:bg-white/[0.04]"
        >
            <div className="flex gap-4">
                {/* Vote badge */}
                <div
                    className={cn(
                        "flex shrink-0 flex-col items-center rounded-xl border px-3 py-2.5 text-center",
                        voteColor
                    )}
                >
                    <ArrowUp className="size-3.5 mb-0.5" />
                    <span className="text-base font-bold leading-none">{answer.totalVotes}</span>
                    <span className="mt-0.5 text-[10px] leading-none opacity-70">votes</span>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                    {/* Question link */}
                    <Link
                        href={`/questions/${answer.questionId}/${slugify(answer.questionTitle)}`}
                        className="group/link inline-flex items-start gap-1.5"
                    >
                        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-zinc-600 transition group-hover/link:text-[#a7c8b3]" />
                        <span className="text-sm font-medium text-zinc-400 transition group-hover/link:text-[#a7c8b3]">
                            {answer.questionTitle}
                        </span>
                    </Link>

                    {/* Answer preview */}
                    <div className="mt-2.5">
                        <p className="text-sm leading-relaxed text-zinc-300">
                            {preview}
                        </p>
                        {isLong && (
                            <button
                                onClick={onToggleExpand}
                                className="mt-1.5 text-xs font-medium text-[#a7c8b3]/70 transition hover:text-[#a7c8b3]"
                            >
                                {isExpanded ? "Show less" : "Show more"}
                            </button>
                        )}
                    </div>

                    {/* Footer row */}
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        {/* Tags */}
                        <div className="flex flex-wrap gap-1.5">
                            {answer.questionTags.slice(0, 4).map((tag) => (
                                <Link
                                    key={tag}
                                    href={`/questions?tag=${tag}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-500 transition hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                                >
                                    <Hash className="size-2.5" />
                                    {tag}
                                </Link>
                            ))}
                        </div>

                        {/* Time + view link */}
                        <div className="flex shrink-0 items-center gap-3">
                            <span className="flex items-center gap-1 text-xs text-zinc-600">
                                <Clock className="size-3" />
                                {convertDateToRelativeTime(new Date(answer.$createdAt))}
                            </span>
                            <Link
                                href={`/questions/${answer.questionId}/${slugify(answer.questionTitle)}`}
                                className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                            >
                                View answer
                                <ExternalLink className="size-3" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </motion.article>
    );
}

// ─── StatRow ──────────────────────────────────────────────────────────────────

function StatRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-500">{label}</span>
            <span className="font-semibold text-zinc-300">{value}</span>
        </div>
    );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({ search }: { search: string }) {
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
                {search ? "No matching answers" : "No answers yet"}
            </h3>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
                {search
                    ? `No answers match "${search}". Try a different search.`
                    : "Answers to questions will appear here once posted."}
            </p>
            {!search && (
                <Button
                    asChild
                    className="mt-6 h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-5 text-sm font-medium text-[#08100b] shadow-none hover:bg-[#b4d6bf]"
                >
                    <Link href="/questions">
                        Browse questions
                    </Link>
                </Button>
            )}
        </motion.div>
    );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({
    currentPage,
    totalPages,
    onPageChange,
}: {
    currentPage: number;
    totalPages: number;
    onPageChange: (p: number) => void;
}) {
    const pages = React.useMemo(() => {
        const range: (number | "…")[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) range.push(i);
        } else {
            range.push(1);
            if (currentPage > 3) range.push("…");
            for (
                let i = Math.max(2, currentPage - 1);
                i <= Math.min(totalPages - 1, currentPage + 1);
                i++
            )
                range.push(i);
            if (currentPage < totalPages - 2) range.push("…");
            range.push(totalPages);
        }
        return range;
    }, [currentPage, totalPages]);

    return (
        <div className="mt-8 flex items-center justify-center gap-1.5">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30"
            >
                <ChevronLeft className="size-4" />
            </button>

            {pages.map((p, i) =>
                p === "…" ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-zinc-600">
                        …
                    </span>
                ) : (
                    <button
                        key={p}
                        onClick={() => onPageChange(p as number)}
                        className={cn(
                            "flex size-9 items-center justify-center rounded-xl border text-sm font-medium transition",
                            p === currentPage
                                ? "border-[#a7c8b3]/30 bg-[#a7c8b3]/15 text-[#a7c8b3]"
                                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
                        )}
                    >
                        {p}
                    </button>
                )
            )}

            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30"
            >
                <ChevronRight className="size-4" />
            </button>
        </div>
    );
}

// ─── TopNav ───────────────────────────────────────────────────────────────────

function TopNav() {
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
                        placeholder="Search questions, tags, or authors"
                        className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-none transition hover:border-white/15 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                window.location.href = `/questions?search=${encodeURIComponent(
                                    e.currentTarget.value.trim()
                                )}`;
                            }
                        }}
                    />
                </div>

                <Button
                    asChild
                    className="h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-3 text-sm font-medium text-[#08100b] shadow-none transition hover:bg-[#b4d6bf] md:px-4"
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
