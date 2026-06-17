"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
    Activity,
    ChevronLeft,
    ChevronRight,
    Clock3,
    MessageCircle,
    MessageSquareOff,
    Plus,
    Search,
    SlidersHorizontal,
    Tag,
    ThumbsUp,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";

export interface Question {
    $id: string;
    title: string;
    content: string;
    tags: string[];
    $createdAt: string;
    $updatedAt: string;
    activityAt: string;
    totalAnswers: number;
    totalVotes: number;
    totalViews: number;
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

const filters = [
    { label: "Newest", icon: Clock3 },
    { label: "Active", icon: Activity },
    { label: "Most Voted", icon: ThumbsUp },
    { label: "Unanswered", icon: MessageSquareOff },
];

const compactNumber = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
});

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
    const [isPending, startTransition] = React.useTransition();
    const [searchValue, setSearchValue] = React.useState(initialSearch);

    React.useEffect(() => {
        setSearchValue(initialSearch);
    }, [initialSearch]);

    const totalPages = Math.ceil(total / limit);

    const updateParams = React.useCallback(
        (params: Record<string, string | undefined>) => {
            const nextParams = new URLSearchParams(searchParams.toString());

            Object.entries(params).forEach(([key, value]) => {
                if (!value) nextParams.delete(key);
                else nextParams.set(key, value);
            });

            const query = nextParams.toString();
            startTransition(() => {
                router.push(query ? `${pathname}?${query}` : pathname);
            });
        },
        [pathname, router, searchParams]
    );

    const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        updateParams({
            search: searchValue.trim() || undefined,
            page: "1",
        });
    };

    const handleFilterChange = (filter: string) => {
        updateParams({
            filter: filter === "Newest" ? undefined : filter,
            page: "1",
        });
    };

    return (
        <div className="mx-auto w-full max-w-6xl space-y-7 pb-10">
            <section className="space-y-6">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                        {initialTag && (
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-3 py-1 text-sm font-medium text-[#a7c8b3]">
                                    <Tag className="size-3.5" />
                                    {initialTag}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => updateParams({ tag: undefined, page: "1" })}
                                    className="inline-flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-zinc-500 transition hover:border-white/20 hover:text-zinc-100"
                                    aria-label="Clear tag filter"
                                >
                                    <X className="size-3.5" />
                                </button>
                            </div>
                        )}

                        <h1 className="text-4xl font-semibold tracking-normal text-zinc-50 sm:text-5xl">
                            All Questions
                        </h1>
                        <p className="mt-3 text-base text-zinc-400">
                            {total.toLocaleString()} question{total === 1 ? "" : "s"}
                            {initialSearch ? ` matching "${initialSearch}"` : ""}
                            {initialTag ? ` tagged "${initialTag}"` : ""}
                        </p>
                    </div>
            </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-black/20 backdrop-blur-xl">
                    <form onSubmit={handleSearch} className="relative">
                        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" />
                        <Input
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            placeholder="Search questions by title, description, or tag..."
                            className="h-14 rounded-xl border-white/10 bg-black/20 pl-12 pr-28 text-base text-zinc-100 shadow-none transition placeholder:text-zinc-600 hover:border-white/15 focus-visible:border-[#a7c8b3]/50 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                        />
                        <button
                            type="submit"
                            className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-lg bg-white/[0.08] px-4 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.12] hover:text-white"
                        >
                            Search
                        </button>
                    </form>
                </div>

                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div className="flex overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-xl">
                        {filters.map((filter) => (
                            <FilterTab
                                key={filter.label}
                                filter={filter}
                                active={initialFilter === filter.label}
                                onClick={() => handleFilterChange(filter.label)}
                            />
                        ))}
                    </div>

                    <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-400 backdrop-blur-xl">
                        <SlidersHorizontal className="size-4 text-[#a7c8b3]" />
                        Showing {questions.length.toLocaleString()} on this page
                    </div>
                </div>
            </section>

            <motion.section
                animate={{ opacity: isPending ? 0.55 : 1 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-xl"
            >
                {questions.length === 0 ? (
                    <EmptyState search={initialSearch} tag={initialTag} />
                ) : (
                    <div className="divide-y divide-white/10">
                        {questions.map((question) => (
                            <QuestionCard key={question.$id} question={question} />
                        ))}
                    </div>
                )}
            </motion.section>

            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={(page) => updateParams({ page: String(page) })}
                />
            )}
        </div>
    );
}

function FilterTab({
    filter,
    active,
    onClick,
}: {
    filter: (typeof filters)[number];
    active: boolean;
    onClick: () => void;
}) {
    const Icon = filter.icon;

    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                "relative flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium text-zinc-400 transition hover:text-zinc-100",
                active && "text-[#07100b]"
            )}
        >
            {active && (
                <motion.span
                    layoutId="questions-filter-active"
                    className="absolute inset-0 rounded-xl bg-[#a7c8b3] shadow-lg shadow-[#a7c8b3]/10"
                    transition={{ duration: 0.2, ease: "easeOut" }}
                />
            )}
            <Icon className="relative size-4" />
            <span className="relative whitespace-nowrap">{filter.label}</span>
        </button>
    );
}

function QuestionCard({ question }: { question: Question }) {
    const excerpt = getQuestionExcerpt(question.content, 200);

    return (
        <motion.article
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="group flex gap-5 border-b border-white/10 px-5 py-5 transition-[background] hover:bg-white/[0.02] sm:gap-6"
        >
            {/* Left: stacked stats, centered */}
            <div className="flex w-[70px] shrink-0 flex-col items-center gap-2 pt-0.5">
                <div className={cn(
                    "text-center",
                    question.totalVotes > 0 ? "text-zinc-100" : "text-zinc-600"
                )}>
                    <div className="text-base font-semibold leading-none">{compactNumber.format(question.totalVotes)}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">votes</div>
                </div>
                <div className={cn(
                    "text-center",
                    question.totalAnswers > 0 ? "text-zinc-100" : "text-zinc-600"
                )}>
                    <div className="text-base font-semibold leading-none">{compactNumber.format(question.totalAnswers)}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">answers</div>
                </div>
                <div className="text-center text-zinc-600">
                    <div className="text-base font-semibold leading-none">{compactNumber.format(question.totalViews)}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">views</div>
                </div>
            </div>

            {/* Right: content */}
            <div className="min-w-0 flex-1">
                <Link href={`/questions/${question.$id}/${slugify(question.title)}`}>
                    <h2 className="text-[15px] font-medium leading-snug text-[#a7c8b3] transition group-hover:text-[#c6e2cf]">
                        {question.title}
                    </h2>
                </Link>

                {excerpt && (
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">
                        {excerpt}
                    </p>
                )}

                {/* Tags */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {question.tags.slice(0, 5).map((tag) => (
                        <Link
                            key={tag}
                            href={`/questions?tag=${encodeURIComponent(tag)}`}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-zinc-400 transition hover:border-[#a7c8b3]/30 hover:text-[#b9dcc3]"
                        >
                            {tag}
                        </Link>
                    ))}
                </div>

                {/* Author row - bottom right */}
                <div className="mt-2.5 flex justify-end">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <span
                            className="flex size-5 items-center justify-center rounded-full border border-white/10 bg-[#a7c8b3]/15 text-[9px] font-bold text-[#b9dcc3]"
                        >
                            {getInitials(question.author.name)}
                        </span>
                        <Link
                            href={`/users/${question.author.$id}/${slugify(question.author.name)}`}
                            className="font-medium text-[#a7c8b3] transition hover:text-[#c6e2cf]"
                        >
                            {question.author.name}
                        </Link>
                        <span className="font-medium text-zinc-400">{compactNumber.format(question.author.reputation)}</span>
                        <span className="text-zinc-600">asked {convertDateToRelativeTime(new Date(question.$createdAt))}</span>
                    </div>
                </div>
            </div>
        </motion.article>
    );
}

function Pagination({
    currentPage,
    totalPages,
    onPageChange,
}: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}) {
    const pages = React.useMemo(() => {
        const range: (number | "...")[] = [];

        if (totalPages <= 7) {
            for (let page = 1; page <= totalPages; page++) range.push(page);
        } else {
            range.push(1);
            if (currentPage > 3) range.push("...");
            for (
                let page = Math.max(2, currentPage - 1);
                page <= Math.min(totalPages - 1, currentPage + 1);
                page++
            ) {
                range.push(page);
            }
            if (currentPage < totalPages - 2) range.push("...");
            range.push(totalPages);
        }

        return range;
    }, [currentPage, totalPages]);

    return (
        <nav className="flex items-center justify-center gap-1.5" aria-label="Questions pagination">
            <button
                type="button"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-35"
                aria-label="Previous page"
            >
                <ChevronLeft className="size-4" />
            </button>

            {pages.map((page, index) =>
                page === "..." ? (
                    <span key={`ellipsis-${index}`} className="px-2 text-sm text-zinc-600">
                        ...
                    </span>
                ) : (
                    <button
                        key={page}
                        type="button"
                        onClick={() => onPageChange(page)}
                        className={cn(
                            "flex size-10 items-center justify-center rounded-xl border text-sm font-medium transition",
                            page === currentPage
                                ? "border-[#a7c8b3]/35 bg-[#a7c8b3]/15 text-[#b9dcc3]"
                                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
                        )}
                        aria-current={page === currentPage ? "page" : undefined}
                    >
                        {page}
                    </button>
                )
            )}

            <button
                type="button"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-35"
                aria-label="Next page"
            >
                <ChevronRight className="size-4" />
            </button>
        </nav>
    );
}

function EmptyState({ search, tag }: { search: string; tag: string }) {
    return (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <Search className="size-7 text-zinc-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100">No questions found</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                {search
                    ? `No results for "${search}". Try a different search term.`
                    : tag
                    ? `No questions tagged "${tag}" yet.`
                    : "Start the conversation by asking the first question."}
            </p>
            <Button
                asChild
                className="mt-6 h-11 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-5 text-sm font-semibold text-[#08100b] shadow-none hover:bg-[#b8d9c2]"
            >
                <Link href="/questions/ask">
                    <Plus className="size-4" />
                    Ask question
                </Link>
            </Button>
        </div>
    );
}

function getQuestionExcerpt(content: string, maxLength: number) {
    const clean = content
        .replace(/```[\s\S]*?```/g, " code block ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[#*_>![\]]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    if (clean.length <= maxLength) return clean;
    return `${clean.slice(0, maxLength).trim()}...`;
}

function getInitials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("") || "?";
}
