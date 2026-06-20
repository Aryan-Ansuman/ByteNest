"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Hash, Clock, TrendingUp, CornerDownLeft, X } from "lucide-react";
import slugify from "@/utils/slugify";

const RECENT_SEARCHES_KEY = "bytenest_recent_searches";
const MAX_RECENT = 5;

interface Suggestion {
    $id: string;
    title: string;
    tags: string[];
}

function getRecentSearches(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function addRecentSearch(term: string) {
    if (typeof window === "undefined" || !term.trim()) return;
    try {
        const current = getRecentSearches().filter((t) => t.toLowerCase() !== term.toLowerCase());
        const next = [term, ...current].slice(0, MAX_RECENT);
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
    } catch {
        // ignore storage errors
    }
}

export default function CommandPalette({
    trendingTags = [],
}: {
    trendingTags?: string[];
}) {
    const router = useRouter();
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
    const [recentSearches, setRecentSearches] = React.useState<string[]>([]);
    const [activeIndex, setActiveIndex] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen((v) => !v);
            }
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    React.useEffect(() => {
        if (open) {
            setRecentSearches(getRecentSearches());
            setQuery("");
            setSuggestions([]);
            setActiveIndex(0);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [open]);

    React.useEffect(() => {
        if (!query.trim() || query.trim().length < 2) {
            setSuggestions([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        setLoading(true);
        const timer = window.setTimeout(async () => {
            try {
                const res = await fetch(
                    `/api/search-suggestions?q=${encodeURIComponent(query.trim())}`,
                    { signal: controller.signal }
                );
                const data = await res.json();
                setSuggestions(data?.data ?? []);
            } catch {
                // ignore aborted/failed requests
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [query]);

    const runSearch = (term: string) => {
        if (!term.trim()) return;
        addRecentSearch(term.trim());
        setOpen(false);
        router.push(`/questions?search=${encodeURIComponent(term.trim())}`);
    };

    const goToQuestion = (suggestion: Suggestion) => {
        addRecentSearch(suggestion.title);
        setOpen(false);
        router.push(`/questions/${suggestion.$id}/${slugify(suggestion.title)}`);
    };

    const flatCount = query.trim() ? suggestions.length + 1 : 0;

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!flatCount) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, flatCount - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeIndex < suggestions.length) goToQuestion(suggestions[activeIndex]);
            else runSearch(query);
        }
    };

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="relative flex h-11 w-full max-w-2xl items-center rounded-xl border border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-zinc-500 shadow-none transition duration-200 ease-out hover:border-white/15"
            >
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <span className="truncate">Search questions, tags, or authors…</span>
                <span className="ml-auto hidden items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 sm:flex">
                    <span>⌘</span>K
                </span>
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-start justify-center bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.98 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0c] shadow-[0_24px_70px_-12px_rgba(0,0,0,0.7)]"
                        >
                            <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5">
                                <Search className="size-4 shrink-0 text-zinc-500" />
                                <input
                                    ref={inputRef}
                                    value={query}
                                    onChange={(e) => {
                                        setQuery(e.target.value);
                                        setActiveIndex(0);
                                    }}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Search questions, tags, or authors…"
                                    className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                                />
                                <button
                                    onClick={() => setOpen(false)}
                                    aria-label="Close search"
                                    className="flex size-6 items-center justify-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-300"
                                >
                                    <X className="size-3.5" />
                                </button>
                            </div>

                            <div className="max-h-[60vh] overflow-y-auto p-2">
                                {!query.trim() && (
                                    <>
                                        {recentSearches.length > 0 && (
                                            <div className="mb-2">
                                                <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
                                                    Recent searches
                                                </p>
                                                {recentSearches.map((term) => (
                                                    <button
                                                        key={term}
                                                        onClick={() => runSearch(term)}
                                                        className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-zinc-300 transition hover:bg-white/[0.05]"
                                                    >
                                                        <Clock className="size-3.5 shrink-0 text-zinc-500" />
                                                        {term}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {trendingTags.length > 0 && (
                                            <div>
                                                <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
                                                    Trending tags
                                                </p>
                                                <div className="flex flex-wrap gap-1.5 px-2.5 py-1">
                                                    {trendingTags.map((tag) => (
                                                        <button
                                                            key={tag}
                                                            onClick={() => {
                                                                setOpen(false);
                                                                router.push(`/questions?tag=${encodeURIComponent(tag)}`);
                                                            }}
                                                            className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-400 transition hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                                                        >
                                                            <TrendingUp className="size-3" />
                                                            {tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {recentSearches.length === 0 && trendingTags.length === 0 && (
                                            <p className="px-2.5 py-6 text-center text-sm text-zinc-600">
                                                Start typing to search questions…
                                            </p>
                                        )}
                                    </>
                                )}

                                {query.trim() && (
                                    <>
                                        {loading && (
                                            <p className="px-2.5 py-3 text-sm text-zinc-600">Searching…</p>
                                        )}
                                        {!loading && suggestions.length > 0 && (
                                            <div className="mb-1">
                                                <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
                                                    Questions
                                                </p>
                                                {suggestions.map((s, i) => (
                                                    <button
                                                        key={s.$id}
                                                        onClick={() => goToQuestion(s)}
                                                        onMouseEnter={() => setActiveIndex(i)}
                                                        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                                                            activeIndex === i
                                                                ? "bg-[#a7c8b3]/10 text-[#a7c8b3]"
                                                                : "text-zinc-300 hover:bg-white/[0.05]"
                                                        }`}
                                                    >
                                                        <Search className="size-3.5 shrink-0 text-zinc-500" />
                                                        <span className="truncate">{s.title}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <button
                                            onClick={() => runSearch(query)}
                                            onMouseEnter={() => setActiveIndex(suggestions.length)}
                                            className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                                                activeIndex === suggestions.length
                                                    ? "bg-[#a7c8b3]/10 text-[#a7c8b3]"
                                                    : "text-zinc-300 hover:bg-white/[0.05]"
                                            }`}
                                        >
                                            <span className="flex items-center gap-2.5">
                                                <Hash className="size-3.5 shrink-0 text-zinc-500" />
                                                Search for &ldquo;{query.trim()}&rdquo;
                                            </span>
                                            <CornerDownLeft className="size-3.5 shrink-0 text-zinc-600" />
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
