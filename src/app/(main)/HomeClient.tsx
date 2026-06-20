"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
    MessageCircle,
    Plus,
    ChevronRight,
    Bookmark,
    ArrowUp,
    ArrowDown,
    Trophy,
    Hash,
    Newspaper,
    Flame,
    Send,
    Loader2,
    Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";
import { useAuthStore } from "@/store/Auth";
import { avatars } from "@/models/client/config";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import QuestionListSkeleton from "@/components/QuestionCardSkeleton";
import CustomizeFeedModal from "@/components/CustomizeFeedModal";
import { markdownToPlainExcerpt } from "@/lib/sanitize";
import UserAvatar from "@/components/UserAvatar";
import { useRealtimeFeed, type NewQuestionEvent } from "@/hooks/useRealtimeFeed";
import NewQuestionsBanner from "@/components/NewQuestionsBanner";
import SkillProfileWidget from "@/components/SkillProfileWidget";

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
    userHasTagPreferences: boolean;
    nextCursor?: string;
    hasMore: boolean;
}

type VoteStatus = "upvoted" | "downvoted";
type FeedVoteState = {
    score: number;
    status: VoteStatus | null;
    pending: boolean;
};

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
    questions: initialQuestions, 
    totalQuestions, 
    totalAnswers, 
    initialFilter,
    trendingTags,
    communityHighlights,
    developerNews,
    userHasTagPreferences,
    nextCursor: initialNextCursor,
    hasMore: initialHasMore,
}: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { session, user, toggleBookmark } = useAuthStore();
    const shouldReduceMotion = useReducedMotion();

    const [activeFilter, setActiveFilter] = React.useState(initialFilter === "Newest" ? "For you" : initialFilter);
    const [askInput, setAskInput] = React.useState("");
    const [customizeFeedOpen, setCustomizeFeedOpen] = React.useState(false);
    const [isFilterPending, startFilterTransition] = React.useTransition();

    const [allQuestions, setAllQuestions] = React.useState<Question[]>(initialQuestions);
    const [nextCursor, setNextCursor] = React.useState(initialNextCursor);
    const [hasMore, setHasMore] = React.useState(initialHasMore);
    const [isLoadingMore, setIsLoadingMore] = React.useState(false);

    // ─── Realtime state ───────────────────────────────────────────────────────
    const [pendingNewQuestions, setPendingNewQuestions] = React.useState<NewQuestionEvent[]>([]);
    const existingIdsRef = React.useRef(new Set(initialQuestions.map((q) => q.$id)));

    const [feedVotes, setFeedVotes] = React.useState<Record<string, FeedVoteState>>(
        () =>
            Object.fromEntries(
                initialQuestions.map((question) => [
                    question.$id,
                    { score: question.totalVotes, status: null, pending: false },
                ])
            )
    );
    const pendingFeedVotes = React.useRef<Set<string>>(new Set());

    React.useEffect(() => {
        setAllQuestions(initialQuestions);
        setNextCursor(initialNextCursor);
        setHasMore(initialHasMore);
        existingIdsRef.current = new Set(initialQuestions.map((q) => q.$id));
        setPendingNewQuestions([]);
    }, [initialQuestions, initialNextCursor, initialHasMore]);

    React.useEffect(() => {
        setFeedVotes((previous) =>
            Object.fromEntries(
                allQuestions.map((question) => [
                    question.$id,
                    previous[question.$id] ?? {
                        score: question.totalVotes,
                        status: null,
                        pending: false,
                    },
                ])
            )
        );
    }, [allQuestions]);

    React.useEffect(() => {
        if (!session || !user || allQuestions.length === 0) return;
        const ids = allQuestions.map((question) => question.$id);
        const params = new URLSearchParams({
            type: "question",
            typeIds: ids.join(","),
            votedById: user.$id,
        });

        apiFetch<{
            data: { documents: Array<{ typeId: string; voteStatus: VoteStatus }> };
        }>(`/api/vote/batch?${params.toString()}`)
            .then((response) => {
                const statuses = new Map(
                    response.data.documents.map((document) => [
                        document.typeId,
                        document.voteStatus,
                    ])
                );
                setFeedVotes((previous) => {
                    const next = { ...previous };
                    ids.forEach((id) => {
                        const current = next[id];
                        if (current && !current.pending) {
                            next[id] = { ...current, status: statuses.get(id) ?? null };
                        }
                    });
                    return next;
                });
            })
            .catch(() => undefined);
    }, [allQuestions, session, user]);

    // ─── Realtime callbacks ───────────────────────────────────────────────────

    const handleNewQuestion = React.useCallback((question: NewQuestionEvent) => {
        if (existingIdsRef.current.has(question.$id)) return;
        existingIdsRef.current.add(question.$id);
        setPendingNewQuestions((prev) => {
            // Cap at 99 to keep badge readable
            if (prev.length >= 99) return prev;
            return [...prev, question];
        });
    }, []);

    const handleVoteUpdate = React.useCallback((questionId: string, totalVotes: number) => {
        setFeedVotes((previous) => {
            const current = previous[questionId];
            // Don't overwrite if user has a pending optimistic update
            if (!current || current.pending) return previous;
            return { ...previous, [questionId]: { ...current, score: totalVotes } };
        });
    }, []);

    const visibleQuestionIds = React.useMemo(
        () => allQuestions.map((q) => q.$id),
        [allQuestions]
    );

    useRealtimeFeed({
        visibleQuestionIds,
        onNewQuestion: handleNewQuestion,
        onVoteUpdate: handleVoteUpdate,
        enabled: true,
    });

    const handleRefreshFeed = React.useCallback(() => {
        setPendingNewQuestions([]);
        router.refresh();
    }, [router]);

    const handleLoadMore = React.useCallback(async () => {
        if (!nextCursor || isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            const params = new URLSearchParams(searchParams.toString());
            params.set("cursor", nextCursor);
            const res = await fetch(`/api/feed?${params.toString()}`);
            if (!res.ok) throw new Error("Failed to load more");
            const data = await res.json();
            setAllQuestions((prev) => {
                const existingIds = new Set(prev.map((q) => q.$id));
                const newOnes = data.questions.filter((q: Question) => !existingIds.has(q.$id));
                return [...prev, ...newOnes];
            });
            setNextCursor(data.nextCursor);
            setHasMore(data.hasMore);
        } catch {
            toast.error("Could not load more questions");
        } finally {
            setIsLoadingMore(false);
        }
    }, [nextCursor, isLoadingMore, searchParams]);

    const handleFeedVote = React.useCallback(
        async (question: Question, status: VoteStatus) => {
            if (!session || !user) {
                toast.warning("Sign in to vote", {
                    action: { label: "Sign in", onClick: () => router.push("/login") },
                });
                return;
            }

            const current = feedVotes[question.$id] ?? {
                score: question.totalVotes,
                status: null,
                pending: false,
            };
            if (current.pending || pendingFeedVotes.current.has(question.$id)) return;
            pendingFeedVotes.current.add(question.$id);

            const nextStatus = current.status === status ? null : status;
            const optimisticScore =
                current.score + voteDelta(current.status, nextStatus);
            setFeedVotes((previous) => ({
                ...previous,
                [question.$id]: {
                    score: optimisticScore,
                    status: nextStatus,
                    pending: true,
                },
            }));

            try {
                const response = await apiFetch<{
                    data: {
                        document: { voteStatus: VoteStatus } | null;
                        voteResult: number;
                    };
                }>("/api/vote", {
                    method: "POST",
                    body: JSON.stringify({
                        votedById: user.$id,
                        voteStatus: status,
                        type: "question",
                        typeId: question.$id,
                    }),
                });
                setFeedVotes((previous) => ({
                    ...previous,
                    [question.$id]: {
                        score: response.data.voteResult,
                        status: response.data.document?.voteStatus ?? null,
                        pending: false,
                    },
                }));
            } catch (error: any) {
                setFeedVotes((previous) => ({
                    ...previous,
                    [question.$id]: { ...current, pending: false },
                }));
                toast.error(error?.message ?? "Vote failed");
            } finally {
                pendingFeedVotes.current.delete(question.$id);
            }
        },
        [feedVotes, router, session, user]
    );

    const handleBookmark = React.useCallback(
        async (questionId: string) => {
            if (!session || !user) {
                toast.warning("Sign in to bookmark questions", {
                    action: { label: "Sign in", onClick: () => router.push("/login") },
                });
                return;
            }
            const isBookmarked = user.prefs?.bookmarks?.includes(questionId) ?? false;
            try {
                await toggleBookmark(questionId);
                toast.success(isBookmarked ? "Bookmark removed" : "Saved to bookmarks");
            } catch {
                toast.error("Could not update bookmark");
            }
        },
        [router, session, toggleBookmark, user]
    );

    const handleFilterChange = (filter: string) => {
        setActiveFilter(filter);
        const p = new URLSearchParams(searchParams.toString());
        const mapped = filter === "For you" || filter === "Recent" ? "Newest" : filter;
        p.set("filter", mapped);
        startFilterTransition(() => {
            router.push(`${pathname}?${p.toString()}`);
        });
    };

    const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
        let nextIndex = index;
        if (e.key === "ArrowRight") {
            nextIndex = (index + 1) % feedTabs.length;
        } else if (e.key === "ArrowLeft") {
            nextIndex = (index - 1 + feedTabs.length) % feedTabs.length;
        }
        if (nextIndex !== index) {
            e.preventDefault();
            const tabEl = document.getElementById(`feed-tab-${feedTabs[nextIndex].id}`);
            tabEl?.focus();
        }
    };

    const handleAskSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        router.push(`/questions/ask`);
    };

    const displayedQuestions = React.useMemo(() => {
        let q = [...allQuestions];
        if (activeFilter === "Trending") q.sort((a, b) => b.totalVotes - a.totalVotes);
        if (activeFilter === "Unanswered") q = q.filter((q) => q.totalAnswers === 0);
        if (activeFilter === "Most viewed") q.sort((a, b) => b.totalAnswers - a.totalAnswers);
        return q;
    }, [allQuestions, activeFilter]);

    // Animation props respecting reduced motion
    const cardAnimProps = shouldReduceMotion
        ? {}
        : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 } };

    return (
        <div className="flex gap-6">
            <CustomizeFeedModal open={customizeFeedOpen} onClose={() => setCustomizeFeedOpen(false)} />
            
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
                    <StatsRow user={user} totalQuestions={totalQuestions} totalAnswers={totalAnswers} shouldReduceMotion={!!shouldReduceMotion} />
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
                            <span className="text-xs text-zinc-500 hidden sm:inline">
                                {userHasTagPreferences
                                    ? "Filtered by your followed tags"
                                    : "Follow tags to personalise this feed"}
                            </span>
                        </div>
                        <button
                            onClick={() => setCustomizeFeedOpen(true)}
                            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                        >
                            <Settings2 className="size-3.5" />
                            Customize feed
                        </button>
                    </div>

                    {/* Feed Tabs */}
                    <div 
                        className="mb-5 flex overflow-x-auto items-center border-b border-white/10 no-scrollbar"
                        role="tablist"
                        aria-label="Feed sections"
                    >
                        {feedTabs.map((tab, idx) => (
                            <button
                                key={tab.id}
                                id={`feed-tab-${tab.id}`}
                                role="tab"
                                aria-selected={activeFilter === tab.id}
                                tabIndex={activeFilter === tab.id ? 0 : -1}
                                onClick={() => handleFilterChange(tab.id)}
                                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                                className={cn(
                                    "relative whitespace-nowrap pb-3 pr-5 text-sm transition duration-200 outline-none focus-visible:text-zinc-100",
                                    activeFilter === tab.id
                                        ? "font-semibold text-zinc-100"
                                        : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                {tab.label}
                                {activeFilter === tab.id && (
                                    shouldReduceMotion ? (
                                        <div className="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-[#a7c8b3]" />
                                    ) : (
                                        <motion.div
                                            layoutId="feed-tab-underline"
                                            className="absolute bottom-0 left-0 right-5 h-0.5 rounded-full bg-[#a7c8b3]"
                                            transition={{ duration: 0.18, ease: "easeOut" }}
                                        />
                                    )
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Realtime new questions banner */}
                    <NewQuestionsBanner
                        count={pendingNewQuestions.length}
                        onRefresh={handleRefreshFeed}
                    />

                    {/* Question Cards */}
                    <AnimatePresence mode="wait">
                        {isFilterPending ? (
                            <motion.div key="skeleton" {...(shouldReduceMotion ? {} : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } })}>
                                <QuestionListSkeleton count={5} />
                            </motion.div>
                        ) : displayedQuestions.length === 0 ? (
                            <EmptyState filter={activeFilter} onCustomize={() => setCustomizeFeedOpen(true)} />
                        ) : (
                            <motion.div
                                key={activeFilter}
                                {...cardAnimProps}
                                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
                                className="space-y-3"
                            >
                                {displayedQuestions.map((q) => (
                                    <QuestionCard
                                        key={q.$id}
                                        question={q}
                                        voteState={
                                            feedVotes[q.$id] ?? {
                                                score: q.totalVotes,
                                                status: null,
                                                pending: false,
                                            }
                                        }
                                        onVote={(status) => handleFeedVote(q, status)}
                                        bookmarked={user?.prefs?.bookmarks?.includes(q.$id) ?? false}
                                        onBookmark={() => handleBookmark(q.$id)}
                                    />
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* View All */}
                    {!isFilterPending && displayedQuestions.length > 0 && (
                        <div className="mt-5 flex flex-col items-center gap-3">
                            {hasMore && (
                                <button
                                    onClick={handleLoadMore}
                                    disabled={isLoadingMore}
                                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] text-sm text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isLoadingMore ? (
                                        <>
                                            <Loader2 className="size-4 animate-spin" />
                                            Loading…
                                        </>
                                    ) : (
                                        <>
                                            Load more questions
                                            <ChevronRight className="size-4" />
                                        </>
                                    )}
                                </button>
                            )}
                            <Link
                                href="/questions"
                                className="text-xs text-zinc-600 transition hover:text-zinc-400"
                            >
                                Browse all questions →
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Right Sidebar ── */}
            <aside className="hidden w-72 shrink-0 xl:block">
                {/* Skill Profile */}
                <SkillProfileWidget />

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
                <div 
                    className="absolute inset-0 z-10" 
                    style={{ background: "linear-gradient(90deg, #0a1410 0%, rgba(10,20,16,0.85) 30%, rgba(10,20,16,0.3) 60%, transparent 100%)" }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a1410] via-transparent to-transparent z-10 md:hidden" />
                <Image 
                    src="/images/hero-bg.png" 
                    alt="Developer workspace" 
                    fill
                    priority
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 66vw, 60vw"
                    className="object-cover object-right opacity-100 transition-opacity duration-500" 
                    onError={(e) => {
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
                        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-transparent bg-[#a7c8b3] px-6 text-sm font-semibold text-[#08100b] shadow-[0_0_15px_rgba(167,200,179,0.15)] transition hover:bg-[#b4d6bf] hover:shadow-[0_0_20px_rgba(167,200,179,0.25)]"
                    >
                        Ask a Question
                    </Link>
                    <Link
                        href="/questions"
                        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-6 text-sm font-semibold text-zinc-100 backdrop-blur-md transition hover:bg-white/[0.04] hover:border-white/20"
                    >
                        Explore Questions
                    </Link>
                </div>
            </div>
        </div>
    );
}

// ─── Stats Row ────────────────────────────────────────────────────────────────

function StatsRow({ user, totalQuestions, totalAnswers, shouldReduceMotion }: { user: any; totalQuestions: number; totalAnswers: number; shouldReduceMotion: boolean }) {
    const stats = [
        {
            value: user?.prefs?.reputation ?? 0,
            label: "Reputation",
            sub: "Keep contributing!",
            icon: (
                <div className="flex size-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="8" r="4" stroke="#60a5fa" strokeWidth="1.5"/>
                        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                </div>
            ),
        },
        {
            value: totalQuestions,
            label: "Questions",
            sub: "Keep asking!",
            icon: (
                <div className="flex size-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
                    <MessageCircle className="size-5 text-emerald-400" />
                </div>
            ),
        },
        {
            value: totalAnswers,
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
                <div className="flex size-10 items-center justify-center rounded-xl border border-zinc-500/20 bg-zinc-500/10 opacity-70">
                    <Trophy className="size-5 text-zinc-500" />
                </div>
            ),
        },
    ];

    return (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((stat, i) => (
                <motion.div
                    key={stat.label}
                    initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, delay: i * 0.06 }}
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

function QuestionCard({
    question,
    voteState,
    onVote,
    bookmarked,
    onBookmark,
}: {
    question: Question;
    voteState: FeedVoteState;
    onVote: (status: VoteStatus) => void;
    bookmarked: boolean;
    onBookmark: () => Promise<void>;
}) {
    const [bookmarkPending, setBookmarkPending] = React.useState(false);

    const excerpt = markdownToPlainExcerpt(question.content);

    return (
        <motion.article
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="group rounded-xl border border-white/10 bg-white/[0.025] transition-[background,border-color] duration-200 hover:border-white/15 hover:bg-white/[0.04]"
        >
            <div className="flex gap-4 p-5">
                {/* Vote Controls */}
                <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
                    <button
                        type="button"
                        onClick={() => onVote("upvoted")}
                        disabled={voteState.pending}
                        aria-busy={voteState.pending}
                        aria-pressed={voteState.status === "upvoted"}
                        aria-label={`Upvote ${question.title}`}
                        className={cn(
                            "flex size-9 items-center justify-center rounded-lg transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50",
                            voteState.status === "upvoted"
                                ? "bg-[#a7c8b3]/10 text-[#a7c8b3]"
                                : "text-zinc-500 hover:text-[#a7c8b3]"
                        )}
                    >
                        <ArrowUp className="size-5" />
                    </button>
                    <span className={cn(
                        "text-sm font-bold min-w-[2ch] text-center",
                        voteState.score > 0 ? "text-[#a7c8b3]" : voteState.score < 0 ? "text-red-400" : "text-zinc-400"
                    )}>
                        {voteState.score}
                    </span>
                    <button
                        type="button"
                        onClick={() => onVote("downvoted")}
                        disabled={voteState.pending}
                        aria-busy={voteState.pending}
                        aria-pressed={voteState.status === "downvoted"}
                        aria-label={`Downvote ${question.title}`}
                        className={cn(
                            "flex size-9 items-center justify-center rounded-lg transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50",
                            voteState.status === "downvoted"
                                ? "bg-red-400/10 text-red-400"
                                : "text-zinc-500 hover:text-red-400"
                        )}
                    >
                        <ArrowDown className="size-5" />
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
                            type="button"
                            onClick={async () => {
                                if (bookmarkPending) return;
                                setBookmarkPending(true);
                                await onBookmark();
                                setBookmarkPending(false);
                            }}
                            disabled={bookmarkPending}
                            aria-busy={bookmarkPending}
                            aria-pressed={bookmarked}
                            aria-label={bookmarked ? "Remove bookmark" : "Bookmark question"}
                            className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-lg transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50",
                                bookmarked ? "text-[#a7c8b3]" : "text-zinc-500 hover:text-zinc-300"
                            )}
                        >
                            <motion.div
                                animate={bookmarked ? { scale: [0.8, 1.2, 1] } : { scale: 1 }}
                                transition={{ duration: 0.3 }}
                            >
                                <Bookmark className="size-4" fill={bookmarked ? "currentColor" : "none"} />
                            </motion.div>
                        </button>
                    </div>

                    {excerpt && (
                        <p className="mt-1.5 text-sm leading-relaxed text-zinc-500 line-clamp-2">
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
                            <UserAvatar
                                name={question.author.name}
                                size="xs"
                                className="size-5"
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

function voteDelta(previous: VoteStatus | null, next: VoteStatus | null) {
    const value = (status: VoteStatus | null) =>
        status === "upvoted" ? 1 : status === "downvoted" ? -1 : 0;
    return value(next) - value(previous);
}

// ─── Community Highlights ─────────────────────────────────────────────────────

function CommunityHighlights({ contributors }: { contributors: { name: string; $id: string; reputation: number }[] }) {
    const sorted = [...contributors].sort((a, b) => b.reputation - a.reputation);
    
    const highlights = [
        { label: "Top Contributor", sublabel: sorted[0]?.name ?? "victor-dev", value: `${(sorted[0]?.reputation ?? 2400).toLocaleString()} rep`, color: "text-blue-400", dotColor: "bg-blue-400" },
        { label: "Most Helpful", sublabel: sorted[1]?.name ?? "sarah.dev", value: `${(sorted[1]?.reputation ?? 1500).toLocaleString()} rep`, color: "text-[#a7c8b3]", dotColor: "bg-[#a7c8b3]" },
        { label: "Rising Star", sublabel: sorted[2]?.name ?? "aryan231", value: `${(sorted[2]?.reputation ?? 300).toLocaleString()} rep`, color: "text-amber-400", dotColor: "bg-amber-400" },
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
                        <UserAvatar name={h.sublabel} size="sm" className="size-8" />
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
                        <span className="text-xs text-zinc-600 tabular-nums">
                            {questions >= 1000 ? `${(questions / 1000).toFixed(1)}k` : questions} question{questions === 1 ? "" : "s"}
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

function EmptyState({ filter, onCustomize }: { filter: string; onCustomize?: () => void }) {
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
            {onCustomize && filter === "For you" ? (
                <button
                    onClick={onCustomize}
                    className="mt-5 flex h-9 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-4 text-sm font-medium text-[#08100b] transition hover:bg-[#b4d6bf]"
                >
                    <Settings2 className="size-4" />
                    Customize feed
                </button>
            ) : (
                <Link
                    href="/questions/ask"
                    className="mt-5 flex h-9 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-4 text-sm font-medium text-[#08100b] transition hover:bg-[#b4d6bf]"
                >
                    <Plus className="size-4" />
                    Ask a question
                </Link>
            )}
        </motion.div>
    );
}
