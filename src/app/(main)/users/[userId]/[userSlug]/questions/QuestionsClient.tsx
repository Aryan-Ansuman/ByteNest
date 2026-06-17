"use client";

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Plus,
    ChevronLeft,
    ChevronRight,
    MessageCircle,
    ArrowUp,
    ArrowDown,
    Hash,
    Clock,
    TrendingUp,
    Calendar,
    Filter,
    ExternalLink,
    CheckCircle2,
    FileQuestion,
    Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";
import { useAuthStore } from "@/store/Auth";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QuestionItem {
    $id: string;
    title: string;
    content: string;
    tags: string[];
    $createdAt: string;
    $updatedAt: string;
    authorId: string;
    totalVotes: number;
    totalAnswers: number;
    hasAcceptedAnswer: boolean;
}

interface Props {
    questions: QuestionItem[];
    total: number;
    currentPage: number;
    limit: number;
    profileName: string;
    userId: string;
    userSlug: string;
}

type SortMode = "newest" | "oldest" | "most-voted" | "most-answers";

const SORT_OPTIONS: { id: SortMode; label: string; icon: React.ReactNode }[] = [
    { id: "newest", label: "Newest", icon: <Clock className="size-3.5" /> },
    { id: "oldest", label: "Oldest", icon: <Calendar className="size-3.5" /> },
    { id: "most-voted", label: "Most Voted", icon: <TrendingUp className="size-3.5" /> },
    { id: "most-answers", label: "Most Answers", icon: <MessageCircle className="size-3.5" /> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuestionsClient({
    questions,
    total,
    currentPage,
    limit,
    profileName,
    userId,
    userSlug,
}: Props) {
    const { user } = useAuthStore();
    const isOwnProfile = user?.$id === userId;

    const [search, setSearch] = React.useState("");
    const [sortMode, setSortMode] = React.useState<SortMode>("newest");
    const [tagFilter, setTagFilter] = React.useState<string>("");

    const totalPages = Math.ceil(total / limit);

    // ── Derived tag list from current page questions ──
    const allTags = React.useMemo(() => {
        const freq: Record<string, number> = {};
        questions.forEach((q) => q.tags.forEach((t) => (freq[t] = (freq[t] || 0) + 1)));
        return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12);
    }, [questions]);

    // ── Client-side filter + sort on current page ──
    const displayed = React.useMemo(() => {
        let items = [...questions];

        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(
                (item) =>
                    item.title.toLowerCase().includes(q) ||
                    item.content.toLowerCase().includes(q) ||
                    item.tags.some((t) => t.toLowerCase().includes(q))
            );
        }

        if (tagFilter) {
            items = items.filter((item) => item.tags.includes(tagFilter));
        }

        switch (sortMode) {
            case "newest":
                items.sort((a, b) => new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime());
                break;
            case "oldest":
                items.sort((a, b) => new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime());
                break;
            case "most-voted":
                items.sort((a, b) => b.totalVotes - a.totalVotes);
                break;
            case "most-answers":
                items.sort((a, b) => b.totalAnswers - a.totalAnswers);
                break;
        }

        return items;
    }, [questions, search, tagFilter, sortMode]);

    // ── Stats ──
    const stats = React.useMemo(() => {
        const answered = questions.filter((q) => q.totalAnswers > 0).length;
        const avgVotes =
            questions.length > 0
                ? (questions.reduce((s, q) => s + q.totalVotes, 0) / questions.length).toFixed(1)
                : "0";
        const topVotes = questions.length > 0 ? Math.max(...questions.map((q) => q.totalVotes)) : 0;
        return { answered, avgVotes, topVotes };
    }, [questions]);

    const navigate = (page: number) => {
        const url = new URL(window.location.href);
        url.searchParams.set("page", String(page));
        window.location.href = url.toString();
    };

    return (
        <>
            {/* ── Breadcrumb + Header ── */}
            <div className="mb-6">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Link href={`/users/${userId}/${userSlug}`} className="transition hover:text-zinc-300">
                        {profileName}
                    </Link>
                    <span>/</span>
                    <span className="text-zinc-300">Questions</span>
                </div>

                <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                            Questions
                        </h1>
                        <p className="mt-1 text-sm text-zinc-500">
                            {total.toLocaleString()} question{total !== 1 ? "s" : ""} by{" "}
                            <span className="text-zinc-300">{profileName}</span>
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* ── Sort tabs ── */}
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
                                            layoutId="questions-sort-pill"
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
            </div>

            {/* ── Profile Specific Stats & Tags (moved from sidebar) ── */}
            <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
                {/* Stats card */}
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                        Question Stats
                    </p>
                    <div className="space-y-2.5">
                        <StatRow label="Total questions" value={String(total)} />
                        <StatRow label="Answered" value={`${stats.answered}/${questions.length}`} />
                        <StatRow label="Avg. votes" value={stats.avgVotes} />
                        <StatRow label="Best vote score" value={String(stats.topVotes)} />
                    </div>
                </div>

                {/* Tag filter */}
                {allTags.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                            Filter by Tag
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {tagFilter && (
                                <button
                                    onClick={() => setTagFilter("")}
                                    className="flex items-center gap-1 rounded-lg border border-[#a7c8b3]/30 bg-[#a7c8b3]/10 px-2.5 py-1.5 text-xs text-[#a7c8b3] transition hover:bg-[#a7c8b3]/20"
                                >
                                    <Hash className="size-3" />
                                    {tagFilter}
                                    <span className="ml-1 opacity-60">× clear</span>
                                </button>
                            )}
                            {allTags
                                .filter(([t]) => t !== tagFilter)
                                .map(([tag, count]) => (
                                    <button
                                        key={tag}
                                        onClick={() => setTagFilter(tag)}
                                        className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200"
                                    >
                                        <Hash className="size-3 text-[#a7c8b3]/60" />
                                        {tag}
                                        <span className="ml-1 text-zinc-600">{count}</span>
                                    </button>
                                ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Search bar ── */}
            <div className="relative mb-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search questions by title, content, or tag…"
                    className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-none transition hover:border-white/15 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                />
                {search && (
                    <button
                        onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 transition hover:text-zinc-300"
                    >
                        clear
                    </button>
                )}
            </div>

            {/* ── Active filters strip ── */}
            {(search || tagFilter) && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                    <Filter className="size-3.5 shrink-0 text-zinc-500" />
                    <span className="text-sm text-zinc-400">
                        Showing{" "}
                        <span className="font-medium text-zinc-200">{displayed.length}</span>{" "}
                        result{displayed.length !== 1 ? "s" : ""}
                    </span>
                    {search && (
                        <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-zinc-400">
                            &ldquo;{search}&rdquo;
                            <button onClick={() => setSearch("")} className="text-zinc-600 hover:text-zinc-300">
                                ×
                            </button>
                        </span>
                    )}
                    {tagFilter && (
                        <span className="flex items-center gap-1 rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-2.5 py-0.5 text-xs text-[#a7c8b3]">
                            #{tagFilter}
                            <button onClick={() => setTagFilter("")} className="text-[#a7c8b3]/60 hover:text-[#a7c8b3]">
                                ×
                            </button>
                        </span>
                    )}
                </div>
            )}

            {/* ── Question list ── */}
            <section className="space-y-3">
                <AnimatePresence mode="wait">
                    {displayed.length === 0 ? (
                        <EmptyState search={search} tagFilter={tagFilter} isOwnProfile={isOwnProfile} />
                    ) : (
                        <motion.div
                            key={`${sortMode}-${search}-${tagFilter}-${currentPage}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className="space-y-3"
                        >
                            {displayed.map((q, i) => (
                                <QuestionCard
                                    key={q.$id}
                                    question={q}
                                    index={i}
                                    isOwnProfile={isOwnProfile}
                                    onTagClick={setTagFilter}
                                />
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </section>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={navigate}
                />
            )}
        </>
    );
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────

function QuestionCard({
    question,
    index,
    isOwnProfile,
    onTagClick,
}: {
    question: QuestionItem;
    index: number;
    isOwnProfile: boolean;
    onTagClick: (tag: string) => void;
}) {
    const excerpt = question.content
        .replace(/```[\s\S]*?```/g, "[code]")
        .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
        .replace(/[#*_>\[\]!]/g, "")
        .replace(/\n+/g, " ")
        .trim()
        .slice(0, 180);

    const voteColor =
        question.totalVotes > 0
            ? "border-[#a7c8b3]/25 bg-[#a7c8b3]/10 text-[#a7c8b3]"
            : question.totalVotes < 0
            ? "border-red-400/25 bg-red-400/10 text-red-400"
            : "border-white/10 bg-black/20 text-zinc-400";

    const answerColor =
        question.totalAnswers > 0
            ? question.hasAcceptedAnswer
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-[#a7c8b3]/25 bg-[#a7c8b3]/10 text-[#a7c8b3]"
            : "border-white/10 bg-black/20 text-zinc-500";

    return (
        <motion.article
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.04 }}
            className="group rounded-xl border border-white/10 bg-white/[0.025] p-5 transition-[background,border-color] duration-200 hover:border-white/15 hover:bg-white/[0.04]"
        >
            <div className="flex gap-4">
                {/* ── Vote + Answer stats ── */}
                <div className="hidden shrink-0 flex-col gap-2 sm:flex sm:w-24">
                    <div className={cn("rounded-xl border px-3 py-2 text-center", voteColor)}>
                        <div className="flex items-center justify-center gap-1">
                            {question.totalVotes >= 0 ? (
                                <ArrowUp className="size-3.5" />
                            ) : (
                                <ArrowDown className="size-3.5" />
                            )}
                            <span className="text-base font-bold leading-none">
                                {Math.abs(question.totalVotes)}
                            </span>
                        </div>
                        <p className="mt-0.5 text-[10px] opacity-70">votes</p>
                    </div>

                    <div className={cn("rounded-xl border px-3 py-2 text-center", answerColor)}>
                        <div className="flex items-center justify-center gap-1">
                            {question.hasAcceptedAnswer && <CheckCircle2 className="size-3.5" />}
                            <span className="text-base font-bold leading-none">{question.totalAnswers}</span>
                        </div>
                        <p className="mt-0.5 text-[10px] opacity-70">answers</p>
                    </div>
                </div>

                {/* ── Body ── */}
                <div className="min-w-0 flex-1">
                    {/* Mobile stats row */}
                    <div className="mb-3 flex gap-2 sm:hidden">
                        <span className={cn("flex items-center gap-1 rounded-lg border px-2 py-1 text-xs", voteColor)}>
                            <ArrowUp className="size-3" />
                            {question.totalVotes}
                        </span>
                        <span className={cn("flex items-center gap-1 rounded-lg border px-2 py-1 text-xs", answerColor)}>
                            <MessageCircle className="size-3" />
                            {question.totalAnswers}
                        </span>
                    </div>

                    <Link href={`/questions/${question.$id}/${slugify(question.title)}`}>
                        <h2 className="text-base font-semibold leading-snug text-zinc-100 transition duration-200 group-hover:text-[#d3e7d8] sm:text-lg">
                            {question.title}
                        </h2>
                    </Link>

                    {excerpt && (
                        <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                            {excerpt}
                        </p>
                    )}

                    <div className="mt-3 flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
                        <div className="flex flex-wrap gap-1.5">
                            {question.tags.slice(0, 5).map((tag) => (
                                <button
                                    key={tag}
                                    onClick={() => onTagClick(tag)}
                                    className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-500 transition hover:border-[#a7c8b3]/30 hover:bg-[#a7c8b3]/10 hover:text-[#a7c8b3]"
                                >
                                    <Hash className="size-2.5" />
                                    {tag}
                                </button>
                            ))}
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                            <span className="flex items-center gap-1 text-xs text-zinc-600">
                                <Clock className="size-3" />
                                {convertDateToRelativeTime(new Date(question.$createdAt))}
                            </span>

                            <Link
                                href={`/questions/${question.$id}/${slugify(question.title)}`}
                                className="flex h-7 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                            >
                                View
                                <ExternalLink className="size-3" />
                            </Link>

                            {isOwnProfile && (
                                <Link
                                    href={`/questions/${question.$id}/${slugify(question.title)}/edit`}
                                    className="flex size-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-100"
                                    title="Edit question"
                                >
                                    <Pencil className="size-3.5" />
                                </Link>
                            )}
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

function EmptyState({
    search,
    tagFilter,
    isOwnProfile,
}: {
    search: string;
    tagFilter: string;
    isOwnProfile: boolean;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] py-20 text-center"
        >
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <FileQuestion className="size-6 text-zinc-500" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-200">
                {search || tagFilter ? "No matching questions" : "No questions yet"}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
                {search
                    ? `No questions match "${search}". Try a different search.`
                    : tagFilter
                    ? `No questions tagged with "#${tagFilter}".`
                    : isOwnProfile
                    ? "You haven't asked any questions yet. Get started!"
                    : "This user hasn't asked any questions yet."}
            </p>
            {isOwnProfile && !search && !tagFilter && (
                <Button
                    asChild
                    className="mt-6 h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-5 text-sm font-medium text-[#08100b] shadow-none hover:bg-[#b4d6bf]"
                >
                    <Link href="/questions/ask">
                        <Plus className="size-4" />
                        Ask your first question
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
                    <span key={`ellipsis-${i}`} className="px-2 text-zinc-600">…</span>
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
