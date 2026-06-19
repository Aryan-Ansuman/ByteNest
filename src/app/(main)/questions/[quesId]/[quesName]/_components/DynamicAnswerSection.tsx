"use client";

/**
 * DynamicAnswerSection
 * ──────────────────────
 * Fetches answers and question-level comments from the server on mount,
 * then injects them into QuestionDetailContext via the `hydrateDynamic`
 * callback. Rendered inside a <Suspense> boundary in QuestionStaticShell
 * so it never blocks the static question body from painting.
 *
 * This component deliberately has NO skeleton of its own — the parent
 * Suspense boundary in QuestionStaticShell supplies the skeleton, and
 * once this component mounts it immediately starts loading so the
 * transition is seamless.
 */

import React from "react";
import { toast } from "sonner";
import { useQuestionDetail } from "./QuestionDetailContext";
import ContentTabs from "./ContentTabs";

interface AnswerDoc {
    $id: string;
    $createdAt: string;
    $updatedAt: string;
    content: string;
    questionId: string;
    authorId: string;
    isAccepted: boolean;
    totalVotes?: number;
    author: { $id: string; name: string; reputation: number };
    upvotesDocuments: { total: number; documents: any[] };
    downvotesDocuments: { total: number; documents: any[] };
    comments: { total: number; documents: any[] };
}

interface CommentDoc {
    $id: string;
    $createdAt: string;
    $updatedAt: string;
    content: string;
    authorId: string;
    type: "question" | "answer";
    typeId: string;
    parentId?: string | null;
    author: { $id: string; name: string; reputation: number };
}

interface DynamicPayload {
    answers: { total: number; documents: AnswerDoc[] };
    comments: { total: number; documents: CommentDoc[] };
    acceptedAnswerId?: string | null;
    answerPagination?: {
        total: number;
        loaded: number;
        hasMore: boolean;
        nextCursor?: string | null;
    };
}

interface Props {
    questionId: string;
}

export default function DynamicAnswerSection({ questionId }: Props) {
    const { appendDynamicAnswers, answerPagination, hydrateDynamic } = useQuestionDetail();
    const [isLoading, setIsLoading] = React.useState(true);
    const [isLoadingMore, setIsLoadingMore] = React.useState(false);
    const [loadError, setLoadError] = React.useState<string | null>(null);
    const [announcement, setAnnouncement] = React.useState("");
    const [reloadToken, setReloadToken] = React.useState(0);
    const sectionRef = React.useRef<HTMLDivElement>(null);
    const fetchedKey = React.useRef<string | null>(null);

    React.useEffect(() => {
        const requestKey = `${questionId}:${reloadToken}`;
        if (fetchedKey.current === requestKey) return;
        fetchedKey.current = requestKey;

        const controller = new AbortController();
        let settled = false;

        async function load() {
            setIsLoading(true);
            setLoadError(null);
            try {
                const res = await fetch(
                    `/api/question-dynamic?questionId=${encodeURIComponent(questionId)}`,
                    { signal: controller.signal }
                );

                if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data?.error ?? "Failed to load answers");
                }

                const payload: DynamicPayload = await res.json();
                hydrateDynamic(
                    payload.answers,
                    payload.comments,
                    payload.answerPagination,
                    payload.acceptedAnswerId
                );
                const answerTotal = payload.answers.total;
                setAnnouncement(
                    `${answerTotal} answer${answerTotal === 1 ? "" : "s"} loaded.`
                );
                if (document.activeElement === document.body) {
                    sectionRef.current?.focus({ preventScroll: true });
                }
            } catch (err: any) {
                if (err?.name === "AbortError") return;
                console.error("[DynamicAnswerSection] fetch failed:", err);
                setLoadError(err?.message ?? "Could not load answers.");
                toast.error("Could not load answers — please refresh.");
            } finally {
                settled = true;
                setIsLoading(false);
            }
        }

        load();
        return () => {
            controller.abort();
            if (!settled && fetchedKey.current === requestKey) {
                fetchedKey.current = null;
            }
        };
    }, [questionId, hydrateDynamic, reloadToken]);

    const loadMoreAnswers = React.useCallback(async () => {
        if (!answerPagination.hasMore || !answerPagination.nextCursor || isLoadingMore) return;

        setIsLoadingMore(true);
        setLoadError(null);
        try {
            const params = new URLSearchParams({
                questionId,
                cursor: answerPagination.nextCursor,
            });
            const res = await fetch(`/api/question-dynamic?${params.toString()}`);
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error ?? "Failed to load more answers");
            }

            const payload: DynamicPayload = await res.json();
            appendDynamicAnswers(
                payload.answers,
                payload.comments,
                payload.answerPagination,
                payload.acceptedAnswerId
            );
        } catch (err: any) {
            console.error("[DynamicAnswerSection] load more failed:", err);
            setLoadError(err?.message ?? "Could not load more answers.");
            toast.error("Could not load more answers.");
        } finally {
            setIsLoadingMore(false);
        }
    }, [
        answerPagination.hasMore,
        answerPagination.nextCursor,
        appendDynamicAnswers,
        isLoadingMore,
        questionId,
    ]);

    // ContentTabs reads from context — it renders correctly whether answers
    // have loaded yet or not (shows 0 answers until hydrateDynamic fires).
    return (
        <div
            ref={sectionRef}
            tabIndex={-1}
            aria-busy={isLoading}
            aria-label="Answers and discussion"
            className="outline-none"
        >
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {announcement}
            </p>
            {loadError && (
                <div
                    role="alert"
                    className="mb-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-100"
                >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span>{loadError}</span>
                        <button
                            type="button"
                            onClick={() => setReloadToken((token) => token + 1)}
                            className="rounded-lg border border-red-300/20 px-3 py-1 text-xs font-semibold text-red-100 transition hover:bg-red-300/10"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            )}
            <ContentTabs
                isLoadingDynamic={isLoading}
                isLoadingMoreAnswers={isLoadingMore}
                onLoadMoreAnswers={loadMoreAnswers}
            />
        </div>
    );
}
