"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
    Clock3,
    Flame,
    MessageSquare,
    Plus,
    Search,
    ChevronLeft,
    ChevronRight,
    MessageCircle,
    Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";

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
    total: number;
    currentPage: number;
    limit: number;
    initialSearch: string;
    initialTag: string;
    initialFilter: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const filters = [
    { label: "Newest", icon: Clock3 },
    { label: "Most Voted", icon: Flame },
    { label: "Unanswered", icon: MessageSquare },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuestionsClient({
    questions,
    total,
    currentPage,
    limit,
    initialSearch,
    initialTag,
    initialFilter,
}: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [activeFilter, setActiveFilter] = React.useState(initialFilter);
    const [isTransitioning, setIsTransitioning] = React.useState(false);

    const totalPages = Math.ceil(total / limit);

    // Sort/filter questions client-side after server fetch
    const displayedQuestions = React.useMemo(() => {
        let q = [...questions];
        if (activeFilter === "Most Voted") q.sort((a, b) => b.totalVotes - a.totalVotes);
        if (activeFilter === "Unanswered") q = q.filter((q) => q.totalAnswers === 0);
        return q;
    }, [questions, activeFilter]);

    const navigate = (params: Record<string, string | undefined>) => {
        const p = new URLSearchParams(searchParams.toString());
        Object.entries(params).forEach(([k, v]) => {
            if (v === undefined || v === "") p.delete(k);
            else p.set(k, v);
        });
        setIsTransitioning(true);
        router.push(`${pathname}?${p.toString()}`);
        setTimeout(() => setIsTransitioning(false), 300);
    };

    const handleFilterChange = (f: string) => {
        setActiveFilter(f);
    };

    const handlePageChange = (p: number) => {
        navigate({ page: String(p) });
    };

    return (
        <>
            {/* ── Page Header ── */}
            <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    {initialTag ? (
                        <div className="mb-1 flex items-center gap-2">
                            <Tag className="size-3.5 text-[#a7c8b3]" />
                            <span className="text-sm font-medium text-[#a7c8b3]">
                                #{initialTag}
                            </span>
                            <Link
                                href="/questions"
                                className="text-xs text-zinc-500 hover:text-zinc-300 underline"
                            >
                                clear
                            </Link>
                        </div>
                    ) : (
                        <p className="text-sm font-medium text-[#a7c8b3]">Questions</p>
                    )}
                    <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                        {initialSearch
                            ? `Results for "${initialSearch}"`
                            : initialTag
                            ? `Tagged: ${initialTag}`
                            : "All Questions"}
                    </h1>
                    <p className="mt-1 text-sm text-zinc-500">
                        {total.toLocaleString()} question{total !== 1 ? "s" : ""}
                    </p>
                </div>

                {/* ── Filter Tabs ── */}
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

            {/* ── Search hint when active ── */}
            {initialSearch && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                    <Search className="size-4 text-zinc-500" />
                    <span className="text-sm text-zinc-400">
                        Searching for{" "}
                        <span className="font-medium text-zinc-200">
                            &ldquo;{initialSearch}&rdquo;
                        </span>
                    </span>
                    <button
                        onClick={() => {
                            navigate({ search: undefined, page: "1" });
                        }}
                        className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 underline"
                    >
                        clear
                    </button>
                </div>
            )}

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
                            {Array.from({ length: 5 }).map((_, i) => (
                                <CardSkeleton key={i} />
                            ))}
                        </motion.div>
                    ) : displayedQuestions.length === 0 ? (
                        <EmptyState search={initialSearch} tag={initialTag} />
                    ) : (
                        <motion.div
                            key={`${activeFilter}-${initialSearch}-${currentPage}`}
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

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={handlePageChange}
                />
            )}
        </>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
                    layoutId="active-filter-questions"
                    className="absolute inset-0 rounded-lg bg-[#a7c8b3]"
                    transition={{ duration: 0.18, ease: "easeOut" }}
                />
            )}
            <Icon className="relative size-4" />
            <span className="relative hidden sm:inline">{filter.label}</span>
        </button>
    );
}

function QuestionCard({ question }: { question: Question }) {
    return (
        <Link href={`/questions/${question.$id}/${slugify(question.title)}`}>
            <motion.article
                whileHover={{ y: -2 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="group rounded-xl border border-white/10 bg-white/[0.035] p-5 transition-[background,border-color] duration-200 ease-out hover:border-white/15 hover:bg-white/[0.055]"
            >
                <div className="flex flex-col gap-5 sm:flex-row">
                    {/* ── Stats ── */}
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

                    {/* ── Body ── */}
                    <div className="min-w-0 flex-1">
                        <h2 className="text-lg font-semibold leading-snug tracking-normal text-zinc-50 transition duration-200 ease-out group-hover:text-[#d3e7d8] sm:text-xl">
                            {question.title}
                        </h2>

                        {/* Excerpt — strip markdown for preview */}
                        <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-zinc-400">
                            {question.content
                                .replace(/[#*`_>\[\]!]/g, "")
                                .replace(/\n+/g, " ")
                                .slice(0, 160)}
                        </p>

                        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            {/* Tags */}
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

                            {/* Author + time */}
                            <div className="flex shrink-0 items-center gap-2 text-sm text-zinc-500">
                                <span className="flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[11px] font-semibold text-zinc-200">
                                    {question.author.name.slice(0, 2).toUpperCase()}
                                </span>
                                <span className="font-medium text-zinc-300">
                                    {question.author.name}
                                </span>
                                <span className="text-zinc-600">/</span>
                                <span>
                                    {convertDateToRelativeTime(new Date(question.$createdAt))}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.article>
        </Link>
    );
}

function StatBadge({
    value,
    label,
    emphasized,
}: {
    value: number;
    label: string;
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

function EmptyState({ search, tag }: { search: string; tag: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] py-20 text-center"
        >
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <MessageCircle className="size-6 text-zinc-500" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-200">No questions found</h3>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
                {search
                    ? `No results for "${search}". Try a different search term.`
                    : tag
                    ? `No questions tagged with "${tag}" yet.`
                    : "Be the first to ask a question!"}
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

function CardSkeleton() {
    return (
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-5">
            <div className="flex flex-col gap-5 sm:flex-row">
                <div className="grid grid-cols-2 gap-2 sm:w-24 sm:grid-cols-1">
                    <Skeleton className="h-[58px] rounded-xl bg-white/[0.08]" />
                    <Skeleton className="h-[58px] rounded-xl bg-white/[0.08]" />
                </div>
                <div className="flex-1 space-y-3">
                    <Skeleton className="h-6 w-4/5 rounded-lg bg-white/[0.08]" />
                    <Skeleton className="h-4 w-full rounded-lg bg-white/[0.06]" />
                    <Skeleton className="h-4 w-2/3 rounded-lg bg-white/[0.06]" />
                    <div className="flex items-center justify-between pt-1">
                        <div className="flex gap-2">
                            <Skeleton className="h-6 w-16 rounded-full bg-white/[0.08]" />
                            <Skeleton className="h-6 w-20 rounded-full bg-white/[0.08]" />
                        </div>
                        <Skeleton className="h-7 w-32 rounded-full bg-white/[0.08]" />
                    </div>
                </div>
            </div>
        </div>
    );
}
