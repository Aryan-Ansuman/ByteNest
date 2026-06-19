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
}

interface Props {
    questionId: string;
}

export default function DynamicAnswerSection({ questionId }: Props) {
    const { hydrateDynamic } = useQuestionDetail();
    const [isLoading, setIsLoading] = React.useState(true);
    const [announcement, setAnnouncement] = React.useState("");
    const sectionRef = React.useRef<HTMLDivElement>(null);
    const hasFetched = React.useRef(false);

    React.useEffect(() => {
        if (hasFetched.current) return;
        hasFetched.current = true;

        const controller = new AbortController();

        async function load() {
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
                hydrateDynamic(payload.answers, payload.comments);
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
                toast.error("Could not load answers — please refresh.");
            } finally {
                setIsLoading(false);
            }
        }

        load();
        return () => controller.abort();
    }, [questionId, hydrateDynamic]);

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
            <ContentTabs isLoadingDynamic={isLoading} />
        </div>
    );
}
