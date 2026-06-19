"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowUp,
    ArrowDown,
    Search,
    ChevronLeft,
    ChevronRight,
    Hash,
    Clock,
    ExternalLink,
    ThumbsUp,
    ThumbsDown,
    Filter,
    Vote,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VoteItem {
    $id: string;
    voteStatus: "upvoted" | "downvoted";
    type: "question" | "answer";
    typeId: string;
    $createdAt: string;
    questionId: string;
    questionTitle: string;
    questionTags: string[];
}

interface Props {
    votes: VoteItem[];
    total: number;
    allTotal: number;
    upvotedTotal: number;
    downvotedTotal: number;
    currentPage: number;
    limit: number;
    activeVoteStatus?: "upvoted" | "downvoted";
    profileName: string;
    userId: string;
    userSlug: string;
}

type StatusFilter = "all" | "upvoted" | "downvoted";

// ─── Main Component ───────────────────────────────────────────────────────────

export default function VotesClient({
    votes,
    total,
    allTotal,
    upvotedTotal,
    downvotedTotal,
    currentPage,
    limit,
    activeVoteStatus,
    profileName,
    userId,
    userSlug,
}: Props) {
    const router = useRouter();

    const [search, setSearch] = React.useState("");
    const [typeFilter, setTypeFilter] = React.useState<"all" | "question" | "answer">("all");

    const statusFilter: StatusFilter = activeVoteStatus ?? "all";
    const totalPages = Math.ceil(total / limit);

    // ── Client-side search + type filter on the current page's data ──
    const displayed = React.useMemo(() => {
        let items = [...votes];

        if (typeFilter !== "all") {
            items = items.filter((v) => v.type === typeFilter);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            items = items.filter(
                (v) =>
                    v.questionTitle.toLowerCase().includes(q) ||
                    v.questionTags.some((t) => t.toLowerCase().includes(q))
            );
        }

        return items;
    }, [votes, search, typeFilter]);

    // ── Navigation helpers ──
    const navigateTo = (params: { voteStatus?: string; page?: number }) => {
        const url = new URL(window.location.href);

        if ("voteStatus" in params) {
            if (params.voteStatus) url.searchParams.set("voteStatus", params.voteStatus);
            else url.searchParams.delete("voteStatus");
            url.searchParams.set("page", "1");
        }

        if (params.page) url.searchParams.set("page", String(params.page));

        router.push(url.pathname + "?" + url.searchParams.toString());
    };

    const netVotes = upvotedTotal - downvotedTotal;

    return (
        <>
            {/* ── Breadcrumb + Header ── */}
            <div className="mb-6">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                    <Link href={`/users/${userId}/${userSlug}`} className="transition hover:text-zinc-300">
                        {profileName}
                    </Link>
                    <span>/</span>
                    <span className="text-zinc-300">Votes</span>
                </div>
                <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                            Votes
                        </h1>
                        <p className="mt-1 text-sm text-zinc-500">
                            {allTotal.toLocaleString()} vote{allTotal !== 1 ? "s" : ""} cast by{" "}
                            <span className="text-zinc-300">{profileName}</span>
                        </p>
                    </div>

                    {/* Status filter tabs — server-driven */}
                    <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                        {(
                            [
                                { id: "all", label: "All", icon: <Vote className="size-3.5" /> },
                                { id: "upvoted", label: "Upvoted", icon: <ThumbsUp className="size-3.5" /> },
                                { id: "downvoted", label: "Downvoted", icon: <ThumbsDown className="size-3.5" /> },
                            ] as const
                        ).map((opt) => (
                            <button
                                key={opt.id}
                                onClick={() =>
                                    navigateTo({ voteStatus: opt.id === "all" ? undefined : opt.id })
                                }
                                className={cn(
                                    "relative flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm transition duration-200",
                                    statusFilter === opt.id
                                        ? opt.id === "downvoted"
                                            ? "text-white"
                                            : "text-zinc-950"
                                        : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                {statusFilter === opt.id && (
                                    <motion.span
                                        layoutId="votes-status-pill"
                                        className={cn(
                                            "absolute inset-0 rounded-lg",
                                            opt.id === "downvoted" ? "bg-red-500/80" : "bg-[#a7c8b3]"
                                        )}
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

            {/* ── Stats row ── */}
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat label="Total" value={allTotal} icon={<Vote className="size-4" />} />
                <MiniStat
                    label="Upvoted"
                    value={upvotedTotal}
                    icon={<ThumbsUp className="size-4" />}
                    color="text-[#a7c8b3]"
                />
                <MiniStat
                    label="Downvoted"
                    value={downvotedTotal}
                    icon={<ThumbsDown className="size-4" />}
                    color="text-red-400"
                />
                <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className={cn("flex items-center gap-1.5 text-xs text-zinc-500", netVotes >= 0 ? "text-[#a7c8b3]" : "text-red-400")}>
                        {netVotes >= 0 ? <ArrowUp className="size-4 text-orange-500" /> : <ArrowDown className="size-4 text-red-400" />}
                        Net Sentiment
                    </div>
                    <p className="text-xl font-bold text-zinc-100">{netVotes > 0 ? "+" : ""}{netVotes}</p>
                </div>
            </div>

            {/* ── Search + type filter row ── */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter by question title or tag…"
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

                <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
                    {(["all", "question", "answer"] as const).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTypeFilter(t)}
                            className={cn(
                                "rounded-lg px-3 py-2 text-xs font-medium capitalize transition",
                                typeFilter === t
                                    ? "bg-zinc-700 text-zinc-100"
                                    : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            {t === "all" ? "All types" : `${t}s`}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Active filters summary ── */}
            {(search || typeFilter !== "all") && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                    <Filter className="size-3.5 shrink-0 text-zinc-500" />
                    <span className="text-sm text-zinc-400">
                        Showing{" "}
                        <span className="font-medium text-zinc-200">{displayed.length}</span> of{" "}
                        {votes.length} on this page
                    </span>
                </div>
            )}

            {/* ── Vote list ── */}
            <AnimatePresence mode="wait">
                {displayed.length === 0 ? (
                    <EmptyState search={search} statusFilter={statusFilter} />
                ) : (
                    <motion.div
                        key={`${statusFilter}-${typeFilter}-${search}-${currentPage}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="space-y-3"
                    >
                        {displayed.map((vote, i) => (
                            <VoteCard key={vote.$id} vote={vote} index={i} />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={(p) => navigateTo({ page: p })}
                />
            )}
        </>
    );
}

// ─── VoteCard ─────────────────────────────────────────────────────────────────

function VoteCard({ vote, index }: { vote: VoteItem; index: number }) {
    const isUpvote = vote.voteStatus === "upvoted";

    return (
        <motion.article
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.035 }}
            className="group rounded-xl border border-white/10 bg-white/[0.025] p-5 transition-[background,border-color] duration-200 hover:border-white/15 hover:bg-white/[0.04]"
        >
            <div className="flex items-start gap-4">
                {/* Vote direction badge */}
                <div
                    className={cn(
                        "flex shrink-0 flex-col items-center gap-0.5 rounded-xl border px-3 py-2.5 text-center",
                        isUpvote
                            ? "border-[#a7c8b3]/25 bg-[#a7c8b3]/10 text-[#a7c8b3]"
                            : "border-red-400/25 bg-red-400/10 text-red-400"
                    )}
                >
                    {isUpvote ? <ArrowUp className="size-4 text-orange-500" /> : <ArrowDown className="size-4 text-red-400" />}
                    <span className="text-[10px] font-medium uppercase tracking-wide opacity-80">
                        {isUpvote ? "up" : "down"}
                    </span>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span
                            className={cn(
                                "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                                vote.type === "question"
                                    ? "border-blue-500/25 bg-blue-500/10 text-blue-400"
                                    : "border-purple-500/25 bg-purple-500/10 text-purple-400"
                            )}
                        >
                            {vote.type}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-zinc-600">
                            <Clock className="size-3" />
                            {convertDateToRelativeTime(new Date(vote.$createdAt))}
                        </span>
                    </div>

                    <Link
                        href={`/questions/${vote.questionId}/${slugify(vote.questionTitle)}`}
                        className="group/link mt-2 inline-flex items-start gap-1.5"
                    >
                        <span className="text-sm font-medium text-zinc-200 transition group-hover/link:text-[#a7c8b3] sm:text-base">
                            {vote.questionTitle}
                        </span>
                    </Link>

                    <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap gap-1.5">
                            {vote.questionTags.slice(0, 4).map((tag) => (
                                <Link
                                    key={tag}
                                    href={`/questions?tag=${tag}`}
                                    className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-500 transition hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                                >
                                    <Hash className="size-2.5" />
                                    {tag}
                                </Link>
                            ))}
                        </div>

                        <Link
                            href={`/questions/${vote.questionId}/${slugify(vote.questionTitle)}`}
                            className="flex h-7 w-fit items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                        >
                            View {vote.type}
                            <ExternalLink className="size-3" />
                        </Link>
                    </div>
                </div>
            </div>
        </motion.article>
    );
}

function MiniStat({
    label,
    value,
    icon,
    color,
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
    color?: string;
}) {
    return (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div className={cn("flex items-center gap-1.5 text-xs text-zinc-500", color)}>
                {icon}
                {label}
            </div>
            <p className="text-xl font-bold text-zinc-100">{value}</p>
        </div>
    );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
    search,
    statusFilter,
}: {
    search: string;
    statusFilter: StatusFilter;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] py-20 text-center"
        >
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <Vote className="size-6 text-zinc-500" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-200">
                {search ? "No matching votes" : "No votes in this category"}
            </h3>
            <p className="mt-2 max-w-xs text-sm text-zinc-500">
                {search
                    ? `No votes match "${search}". Try a different search.`
                    : statusFilter === "all"
                    ? "Votes cast on questions and answers will show up here."
                    : `No ${statusFilter} votes yet.`}
            </p>
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
