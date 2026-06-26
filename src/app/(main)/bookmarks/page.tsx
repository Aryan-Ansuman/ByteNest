"use client";

import React from "react";
import Link from "next/link";
import { Bookmark, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/Auth";
import slugify from "@/utils/slugify";
import { markdownToPlainExcerpt } from "@/lib/sanitize";

interface BookmarkedQuestion {
    $id: string;
    $createdAt: string;
    title: string;
    content: string;
    tags: string[];
    totalVotes: number;
    totalAnswers: number;
    author: {
        $id: string;
        name: string;
        reputation: number;
    };
}

export default function BookmarksPage() {
    const { user, toggleBookmark } = useAuthStore();
    const bookmarkIds = user?.prefs?.bookmarks ?? [];
    const bookmarkKey = bookmarkIds.join(",");
    const userId = user?.$id ?? null;
    const [questions, setQuestions] = React.useState<BookmarkedQuestion[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [removingId, setRemovingId] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (!userId || !bookmarkKey) {
            setQuestions([]);
            setError(null);
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        setError(null);
        const requestedIds = bookmarkKey.split(",").filter(Boolean);
        const idChunks = Array.from(
            { length: Math.ceil(requestedIds.length / 100) },
            (_, index) => requestedIds.slice(index * 100, (index + 1) * 100)
        );

        Promise.all(
            idChunks.map(async (ids) => {
                const response = await fetch(
                    `/api/question?ids=${encodeURIComponent(ids.join(","))}`,
                    { signal: controller.signal, cache: "no-store" }
                );
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(payload?.error ?? "Could not load bookmarks");
                }
                return payload.data.documents as BookmarkedQuestion[];
            })
        )
            .then((results) => setQuestions(results.flat()))
            .catch((fetchError: any) => {
                if (fetchError?.name !== "AbortError") {
                    setError(fetchError?.message ?? "Could not load bookmarks");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [bookmarkKey, userId]);

    const removeBookmark = async (questionId: string) => {
        setRemovingId(questionId);
        try {
            await toggleBookmark(questionId);
            setQuestions((current) =>
                current.filter((question) => question.$id !== questionId)
            );
            toast.success("Bookmark removed");
        } catch {
            toast.error("Could not remove bookmark");
        } finally {
            setRemovingId(null);
        }
    };

    if (!user) {
        return (
            <div className="mx-auto max-w-2xl py-16 text-center">
                <Bookmark className="mx-auto size-9 text-zinc-600" />
                <h1 className="mt-4 text-2xl font-bold text-zinc-100">Your bookmarks</h1>
                <p className="mt-2 text-sm text-zinc-500">
                    Sign in to keep saved questions synced across browsers.
                </p>
                <Link
                    href="/login"
                    className="mt-6 inline-flex h-10 items-center rounded-lg bg-[#a7c8b3] px-4 text-sm font-semibold text-[#08100b]"
                >
                    Sign in
                </Link>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-4xl">
            <div className="mb-6 border-b border-white/5 pb-5">
                <h1 className="text-2xl font-bold text-zinc-100">Bookmarks</h1>
                <p className="mt-1 text-sm text-zinc-500">
                    {bookmarkIds.length} saved question{bookmarkIds.length === 1 ? "" : "s"}
                </p>
            </div>

            {loading && (
                <div className="flex items-center justify-center py-16 text-sm text-zinc-500">
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Loading bookmarks
                </div>
            )}

            {error && !loading && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] p-4 text-sm text-red-200">
                    {error}
                </div>
            )}

            {!loading && !error && questions.length === 0 && (
                <div className="py-16 text-center">
                    <Bookmark className="mx-auto size-9 text-zinc-700" />
                    <h2 className="mt-4 text-lg font-semibold text-zinc-200">
                        No bookmarks yet
                    </h2>
                    <Link
                        href="/questions"
                        className="mt-3 inline-block text-sm font-medium text-[#a7c8b3] hover:text-white"
                    >
                        Browse questions
                    </Link>
                </div>
            )}

            {!loading && questions.length > 0 && (
                <div className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                    {questions.map((question) => (
                        <article key={question.$id} className="py-5">
                            <div className="flex items-start gap-4">
                                <div className="hidden w-16 shrink-0 text-right text-xs text-zinc-500 sm:block">
                                    <p className="font-semibold text-zinc-300">
                                        {question.totalVotes}
                                    </p>
                                    <p>votes</p>
                                    <p className="mt-2 font-semibold text-zinc-300">
                                        {question.totalAnswers}
                                    </p>
                                    <p>answers</p>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-3">
                                        <Link
                                            href={`/questions/${question.$id}/${slugify(question.title)}`}
                                            className="text-base font-semibold leading-snug text-zinc-100 transition hover:text-[#cfe8d5]"
                                        >
                                            {question.title}
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => removeBookmark(question.$id)}
                                            disabled={removingId === question.$id}
                                            aria-label="Remove bookmark"
                                            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.05] hover:text-red-400 disabled:cursor-wait disabled:opacity-50"
                                        >
                                            {removingId === question.$id ? (
                                                <Loader2 className="size-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="size-4" />
                                            )}
                                        </button>
                                    </div>
                                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-zinc-500">
                                        {markdownToPlainExcerpt(question.content, 220)}
                                    </p>
                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                        {question.tags.slice(0, 4).map((tag) => (
                                            <Link
                                                key={tag}
                                                href={`/questions?tag=${encodeURIComponent(tag)}`}
                                                className="rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-200"
                                            >
                                                {tag}
                                            </Link>
                                        ))}
                                        <span className="ml-auto flex items-center gap-1 text-xs text-zinc-600 sm:hidden">
                                            <MessageCircle className="size-3.5" />
                                            {question.totalAnswers}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}
