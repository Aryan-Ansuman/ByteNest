"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
    Activity,
    ArrowDown,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    Clock3,
    MessageSquareOff,
    Plus,
    Search,
    Tag,
    ThumbsUp,
    X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { markdownToPlainExcerpt } from "@/lib/sanitize";
import { getUserAvatarStyle, getUserInitials } from "@/utils/userDisplay";
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
    hasAcceptedAnswer: boolean;
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
    rangeStart: number;
    rangeEnd: number;
    previousCursor?: string;
    nextCursor?: string;
}

const filters = [
    { label: "Newest", icon: Clock3, description: "newest first" },
    { label: "Active", icon: Activity, description: "recent activity first" },
    { label: "Most Voted", icon: ThumbsUp, description: "highest votes first" },
    { label: "Unanswered", icon: MessageSquareOff, description: "newest unanswered first" },
] as const;

const tagSuggestions = [
    "javascript",
    "typescript",
    "react",
    "next.js",
    "node.js",
    "python",
    "css",
    "tailwindcss",
    "sql",
    "mongodb",
    "docker",
    "git",
    "api",
    "authentication",
    "performance",
    "testing",
    "deployment",
    "prisma",
    "graphql",
    "websocket",
] as const;

const compactNumber = new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
});

type ParamValue = string | string[] | undefined;
const RESET_PAGINATION = {
    page: undefined,
    cursor: undefined,
    direction: undefined,
} as const;

export default function QuestionsClient({
    questions,
    total,
    currentPage,
    rangeStart,
    rangeEnd,
    previousCursor,
    nextCursor,
}: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = React.useTransition();
    const currentSearch = searchParams.get("search") ?? "";
    const currentTags = searchParams.getAll("tag").filter(Boolean);
    const currentFilter = searchParams.get("filter") ?? "Newest";
    const [searchValue, setSearchValue] = React.useState(currentSearch);
    const [tagValue, setTagValue] = React.useState("");

    const hrefFor = React.useCallback(
        (params: Record<string, ParamValue>) => {
            const nextParams = new URLSearchParams(searchParams.toString());
            Object.entries(params).forEach(([key, value]) => {
                nextParams.delete(key);
                if (Array.isArray(value)) value.filter(Boolean).forEach((item) => nextParams.append(key, item));
                else if (value) nextParams.set(key, value);
            });
            const query = nextParams.toString();
            return query ? `${pathname}?${query}` : pathname;
        },
        [pathname, searchParams]
    );

    const updateParams = React.useCallback(
        (params: Record<string, ParamValue>, replace = false) => {
            const href = hrefFor(params);
            startTransition(() => {
                if (replace) router.replace(href, { scroll: false });
                else router.push(href, { scroll: false });
            });
        },
        [hrefFor, router]
    );

    React.useEffect(() => {
        setSearchValue(currentSearch);
    }, [currentSearch]);

    React.useEffect(() => {
        if (searchValue.trim() === currentSearch) return;

        const timer = window.setTimeout(() => {
            updateParams({ search: searchValue.trim() || undefined, ...RESET_PAGINATION }, true);
        }, 400);

        return () => window.clearTimeout(timer);
    }, [currentSearch, searchValue, updateParams]);

    const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        updateParams({ search: searchValue.trim() || undefined, ...RESET_PAGINATION });
    };

    const handleFilterChange = React.useCallback(
        (filter: string) => {
            updateParams({
                filter: filter === "Newest" ? undefined : filter,
                ...RESET_PAGINATION,
            });
        },
        [updateParams]
    );

    const addTag = React.useCallback(
        (rawTag: string) => {
            const tag = rawTag.toLowerCase().trim().replace(/\s+/g, "-");
            if (!tag || currentTags.includes(tag) || currentTags.length >= 5) return;
            updateParams({ tag: [...currentTags, tag], ...RESET_PAGINATION });
            setTagValue("");
        },
        [currentTags, updateParams]
    );

    const removeTag = React.useCallback(
        (tag: string) => {
            updateParams({
                tag: currentTags.filter((currentTag) => currentTag !== tag),
                ...RESET_PAGINATION,
            });
        },
        [currentTags, updateParams]
    );

    const handlePageChange = React.useCallback(
        (direction: "before" | "after", cursor: string, page: number) => {
            updateParams({ cursor, direction, page: String(page) });
        },
        [updateParams]
    );

    const suggestedTags = tagValue
        ? tagSuggestions.filter(
              (tag) => tag.includes(tagValue.toLowerCase()) && !currentTags.includes(tag)
          )
        : [];

    const clearFiltersHref = hrefFor({
        search: undefined,
        tag: undefined,
        ...RESET_PAGINATION,
    });
    const clearAllHref = hrefFor({
        search: undefined,
        tag: undefined,
        filter: undefined,
        ...RESET_PAGINATION,
    });

    return (
        <div className="mx-auto w-full max-w-6xl space-y-7 pb-10">
            <section className="space-y-6">
                <div className="max-w-2xl">
                    <h1 className="text-4xl font-semibold tracking-normal text-zinc-50 sm:text-5xl">
                        All Questions
                    </h1>
                    <p className="mt-3 text-base text-zinc-400" aria-live="polite">
                        {total === 0
                            ? "No questions to show"
                            : `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()} questions`}
                        {currentSearch ? ` matching “${currentSearch}”` : ""}
                    </p>
                </div>

                <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-3 shadow-2xl shadow-black/20 backdrop-blur-xl">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <form onSubmit={handleSearch} className="relative flex-1 max-w-lg">
                            <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-zinc-500" />
                            <Input
                                value={searchValue}
                                onChange={(event) => setSearchValue(event.target.value)}
                                aria-label="Search questions"
                                placeholder="Search questions by title or description..."
                                className="h-12 rounded-xl border-white/10 bg-black/20 pl-12 pr-4 text-sm text-zinc-100 shadow-none transition placeholder:text-zinc-600 hover:border-white/15 focus-visible:border-[#a7c8b3]/50 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                            />
                        </form>

                        <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-white/10 bg-black/15 p-1.5">
                            {filters.map((filter) => (
                                <FilterTab
                                    key={filter.label}
                                    filter={filter}
                                    active={currentFilter === filter.label}
                                    onClick={() => handleFilterChange(filter.label)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                        <form
                            className="relative flex min-w-0 items-center gap-2"
                            onSubmit={(event) => {
                                event.preventDefault();
                                addTag(tagValue);
                            }}
                        >
                            <Tag className="pointer-events-none absolute left-3 size-4 text-zinc-500" />
                            <Input
                                value={tagValue}
                                onChange={(event) => setTagValue(event.target.value)}
                                aria-label="Add a tag filter"
                                placeholder={currentTags.length >= 5 ? "Maximum 5 tags" : "Filter by tag..."}
                                disabled={currentTags.length >= 5}
                                list="question-tag-suggestions"
                                className="h-10 w-full rounded-xl border-white/10 bg-black/15 pl-9 text-sm sm:w-56"
                            />
                            <datalist id="question-tag-suggestions">
                                {suggestedTags.map((tag) => <option key={tag} value={tag} />)}
                            </datalist>
                            <button
                                type="submit"
                                disabled={!tagValue.trim() || currentTags.length >= 5}
                                className="h-10 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm text-zinc-300 transition hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Add tag filter"
                            >
                                Add
                            </button>
                        </form>

                        {currentTags.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2" aria-label="Active tag filters">
                                <div className="h-4 w-px bg-white/10 mx-2 hidden xl:block" aria-hidden="true" />
                                {currentTags.map((tag) => (
                                    <span key={tag} className="inline-flex items-center gap-1.5 rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 py-1 pl-3 pr-1.5 text-sm font-medium text-[#a7c8b3]">
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => removeTag(tag)}
                                            className="flex size-6 items-center justify-center rounded-full transition hover:bg-white/10"
                                            aria-label={`Remove ${tag} tag filter`}
                                        >
                                            <X className="size-3.5" />
                                        </button>
                                    </span>
                                ))}
                                <Link href={clearFiltersHref} className="ml-2 text-xs text-zinc-500 underline-offset-4 hover:text-zinc-200 hover:underline">
                                    Clear
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="relative">
                {isPending && (
                    <div className="absolute inset-0 z-10 flex flex-col overflow-hidden rounded-2xl bg-white/[0.02] backdrop-blur-[2px] transition-opacity">
                        <QuestionListSkeleton />
                    </div>
                )}
                <div
                    className={cn(
                        "overflow-hidden rounded-2xl border border-white/10 bg-white/[0.025] backdrop-blur-xl transition-opacity",
                        isPending && "opacity-50"
                    )}
                    aria-busy={isPending}
                >
                    {questions.length === 0 ? (
                        <EmptyState
                            search={currentSearch}
                            tags={currentTags}
                            filter={currentFilter}
                            clearFiltersHref={clearAllHref}
                        />
                    ) : (
                        <div className="divide-y divide-white/10">
                            {questions.map((question) => (
                                <QuestionCard
                                    key={question.$id}
                                    question={question}
                                    tagHref={(tag) =>
                                        hrefFor({
                                            tag: currentTags.includes(tag) ? currentTags : [...currentTags, tag],
                                            ...RESET_PAGINATION,
                                        })
                                    }
                                />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {(previousCursor || nextCursor) && (
                <Pagination
                    currentPage={currentPage}
                    previousCursor={previousCursor}
                    nextCursor={nextCursor}
                    onPageChange={handlePageChange}
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
            aria-label={`${filter.label}: ${filter.description}${active ? ", currently selected" : ""}`}
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
            {active && (
                <span className="relative flex size-3.5 items-center justify-center rounded-full bg-black/20" aria-hidden="true">
                    <ArrowDown className="size-2.5" />
                </span>
            )}
        </button>
    );
}

function QuestionCard({ question, tagHref }: { question: Question; tagHref: (tag: string) => string }) {
    const excerpt = markdownToPlainExcerpt(question.content, 150);
    const hiddenTagCount = Math.max(0, question.tags.length - 5);

    return (
        <article className="group flex gap-5 px-5 py-5 transition-colors hover:bg-white/[0.025] sm:gap-6">
            <div className="flex w-[76px] shrink-0 flex-col items-center gap-2 pt-0.5">
                <Stat value={question.totalVotes} label="votes" kind="votes" />
                <Stat
                    value={question.totalAnswers}
                    label="answers"
                    kind={question.hasAcceptedAnswer ? "accepted" : "answers"}
                />
                <Stat value={question.totalViews} label="views" kind="views" />
            </div>

            <div className="min-w-0 flex-1">
                <Link
                    href={`/questions/${question.$id}/${slugify(question.title)}`}
                    className="text-[15px] font-medium leading-snug text-[#a7c8b3] decoration-[#a7c8b3]/60 underline-offset-4 transition group-hover:text-[#c6e2cf] group-hover:underline"
                >
                    {question.title}
                </Link>

                {excerpt && <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{excerpt}</p>}

                <div className="mt-3 flex flex-wrap gap-1.5">
                    {question.tags.slice(0, 5).map((tag) => (
                        <Link
                            key={tag}
                            href={tagHref(tag)}
                            onClick={(e) => {
                                // DO NOT e.stopPropagation() here to allow screen reader access
                            }}
                            className="relative z-10 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-zinc-400 transition hover:border-[#a7c8b3]/30 hover:text-[#b9dcc3]"
                        >
                            {tag}
                        </Link>
                    ))}
                    {hiddenTagCount > 0 && (
                        <span className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-zinc-500" title={`${hiddenTagCount} more tags`}>
                            +{hiddenTagCount}
                        </span>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-end gap-x-2 gap-y-1 text-xs text-zinc-500">
                    <span className={cn("flex size-5 items-center justify-center rounded-full border text-[9px] font-bold text-black", getUserAvatarStyle(question.author.$id))}>
                        {getUserInitials(question.author.name)}
                    </span>
                    {question.author.$id === "deleted" ? (
                        <span className="font-medium text-zinc-500">{question.author.name}</span>
                    ) : (
                        <Link href={`/users/${question.author.$id}/${slugify(question.author.name)}`} className="relative z-10 font-medium text-[#a7c8b3] transition hover:text-[#c6e2cf]">
                            {question.author.name}
                        </Link>
                    )}
                    <span className="font-medium text-zinc-400">{compactNumber.format(question.author.reputation)}</span>
                    <span title={new Date(question.$createdAt).toISOString()}>
                        asked {convertDateToRelativeTime(new Date(question.$createdAt))}
                    </span>
                    {question.activityAt && question.activityAt !== question.$createdAt && (
                        <>
                            <span className="text-zinc-700" aria-hidden="true">•</span>
                            <span className="text-zinc-400" title={new Date(question.activityAt).toISOString()}>
                                active {convertDateToRelativeTime(new Date(question.activityAt))}
                            </span>
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}

function Stat({ value, label, kind }: { value: number; label: string; kind: "votes" | "answers" | "accepted" | "views" }) {
    const emphasized = value !== 0;
    return (
        <div
            className={cn(
                "w-full rounded-lg border border-transparent py-1 text-center",
                kind === "accepted" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
                kind === "votes" && value > 0 && "text-[#c6e2cf]",
                kind === "votes" && value < 0 && "text-rose-300",
                kind === "answers" && emphasized && "text-zinc-200",
                (kind === "views" || !emphasized) && "text-zinc-500"
            )}
        >
            <div className="flex items-center justify-center gap-1 text-base font-semibold leading-none">
                {kind === "accepted" && <CheckCircle2 className="size-3.5" aria-label="Accepted answer" />}
                {compactNumber.format(value)}
            </div>
            <div className={cn("mt-0.5 text-[11px]", kind === "accepted" ? "text-emerald-300/80" : "text-zinc-500")}>{label}</div>
        </div>
    );
}

function Pagination({
    currentPage,
    previousCursor,
    nextCursor,
    onPageChange,
}: {
    currentPage: number;
    previousCursor?: string;
    nextCursor?: string;
    onPageChange: (direction: "before" | "after", cursor: string, page: number) => void;
}) {
    const goPrevious = () => previousCursor && onPageChange("before", previousCursor, currentPage - 1);
    const goNext = () => nextCursor && onPageChange("after", nextCursor, currentPage + 1);

    return (
        <nav
            className="flex items-center justify-center gap-3"
            aria-label="Questions pagination"
            onKeyDown={(event) => {
                if (event.key === "ArrowLeft" && previousCursor) goPrevious();
                if (event.key === "ArrowRight" && nextCursor) goNext();
            }}
        >
            <button
                type="button"
                onClick={goPrevious}
                disabled={!previousCursor}
                className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-35"
                aria-label={`Go to page ${Math.max(1, currentPage - 1)}`}
            >
                <ChevronLeft className="size-4" /> Previous
            </button>
            <span className="text-sm text-zinc-500" aria-current="page">Page {currentPage}</span>
            <button
                type="button"
                onClick={goNext}
                disabled={!nextCursor}
                className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-35"
                aria-label={`Go to page ${currentPage + 1}`}
            >
                Next <ChevronRight className="size-4" />
            </button>
        </nav>
    );
}

function QuestionListSkeleton() {
    return (
        <div className="divide-y divide-white/10" role="status" aria-label="Loading questions">
            {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="flex animate-pulse gap-6 px-5 py-6">
                    <div className="h-24 w-[76px] rounded-xl bg-white/[0.05]" />
                    <div className="flex-1 space-y-3">
                        <div className="h-4 w-3/5 rounded bg-white/[0.08]" />
                        <div className="h-3 w-full rounded bg-white/[0.05]" />
                        <div className="h-3 w-4/5 rounded bg-white/[0.05]" />
                        <div className="h-5 w-2/5 rounded bg-white/[0.05]" />
                    </div>
                </div>
            ))}
            <span className="sr-only">Loading questions…</span>
        </div>
    );
}

function EmptyState({
    search,
    tags,
    filter,
    clearFiltersHref,
}: {
    search: string;
    tags: string[];
    filter: string;
    clearFiltersHref: string;
}) {
    const isFiltered = Boolean(search || tags.length || filter !== "Newest");
    const tagLabel = tags.length === 1 ? tags[0] : tags.join(", ");

    return (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <Search className="size-7 text-zinc-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-100">No questions found</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                {search
                    ? `No results for “${search}”. Try another search or clear the filters.`
                    : tags.length
                      ? `No questions match ${tagLabel}. You can broaden the filters or start the topic.`
                      : filter === "Unanswered"
                        ? "Every matching question has an answer. Clear the filter to see them all."
                      : "Start the conversation by asking the first question."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
                {isFiltered && (
                    <Button asChild variant="outline" className="h-11 rounded-xl border-white/10 bg-white/[0.04] px-5 text-zinc-200 hover:bg-white/[0.08]">
                        <Link href={clearFiltersHref}><X className="size-4" />Clear filters</Link>
                    </Button>
                )}
                <Button asChild className="h-11 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-5 text-sm font-semibold text-[#08100b] shadow-none hover:bg-[#b8d9c2]">
                    <Link href="/questions/ask">
                        <Plus className="size-4" />
                        {tags.length === 1 ? `Ask about ${tags[0]}` : "Ask question"}
                    </Link>
                </Button>
            </div>
        </div>
    );
}
