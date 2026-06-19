"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";

export type VoteStatus = "upvoted" | "downvoted";
export type AnswerSort = "Oldest" | "Active" | "Votes";
export type CommentTargetType = "question" | "answer";

export interface AppDocument {
    $id: string;
    $createdAt: string;
    $updatedAt: string;
    $collectionId?: string;
    $databaseId?: string;
    $permissions?: string[];
}

export interface DocumentList<TDocument extends AppDocument> {
    total: number;
    documents: TDocument[];
}

export interface Author {
    $id: string;
    name: string;
    reputation: number;
}

export interface CurrentUser {
    $id: string;
    name: string;
    prefs?: {
        reputation?: number;
    };
}

export interface QuestionDocument extends AppDocument {
    title: string;
    content: string;
    authorId: string;
    tags?: string[];
    views?: number;
    totalViews?: number;
    attachmentId?: string;
}

export interface VoteDocument extends AppDocument {
    type: CommentTargetType;
    typeId: string;
    voteStatus: VoteStatus;
    votedById: string;
}

export interface CommentDoc extends AppDocument {
    content: string;
    type?: CommentTargetType;
    typeId?: string;
    authorId: string;
    author: Author;
    optimistic?: boolean;
}

export interface AnswerDoc extends AppDocument {
    content: string;
    questionId: string;
    authorId: string;
    author: Author;
    /** True only when the question author explicitly marked this answer accepted. */
    isAccepted: boolean;
    upvotesDocuments: DocumentList<VoteDocument>;
    downvotesDocuments: DocumentList<VoteDocument>;
    comments: DocumentList<CommentDoc>;
    optimistic?: boolean;
}

export interface AiSummaryContent {
    overview: string;
    short?: string;
    answer?: string;
    codeHint?: string;
    checks?: string[];
    sidebarBullets?: string[];
    sourceLabel?: string;
    updatedAt?: string;
}

export interface RelatedConcept {
    title: string;
    href: string;
    source?: string;
    kind?: "docs" | "guide" | "debugging" | "reference";
}

export interface LearningResource {
    title: string;
    description: string;
    href: string;
    kind?: "docs" | "guide" | "debugging" | "reference";
}

export interface SimilarQuestion {
    title: string;
    href: string;
    answers?: number;
}

export interface AnswerPaginationState {
    total: number;
    loaded: number;
    hasMore: boolean;
    nextCursor?: string | null;
}

interface QuestionDetailProviderProps {
    question: QuestionDocument;
    author: Author;
    currentUser: CurrentUser | null;
    answers: DocumentList<AnswerDoc>;
    upvotes: DocumentList<VoteDocument>;
    downvotes: DocumentList<VoteDocument>;
    comments: DocumentList<CommentDoc>;
    attachmentUrl: string;
    aiSummary?: AiSummaryContent | null;
    relatedConcepts?: RelatedConcept[];
    learningResources?: LearningResource[];
    similarQuestions?: SimilarQuestion[];
    answerPagination?: Partial<AnswerPaginationState>;
    children: React.ReactNode;
}

interface QuestionDetailContextValue {
    question: QuestionDocument;
    author: Author;
    currentUser: CurrentUser | null;
    attachmentUrl: string;
    questionTags: string[];
    totalViews: number;
    collectiveLabel: string;
    questionVoteScore: number;
    answerVoteScores: Record<string, number>;
    answerSort: AnswerSort;
    setAnswerSort: (sort: AnswerSort) => void;
    answerComposerOpen: boolean;
    openAnswerComposer: () => void;
    closeAnswerComposer: () => void;
    answers: DocumentList<AnswerDoc>;
    sortedAnswers: AnswerDoc[];
    /** The single explicitly-accepted answer, or null if none has been accepted yet. */
    bestAnswer: AnswerDoc | null;
    communityAnswers: AnswerDoc[];
    questionComments: DocumentList<CommentDoc>;
    totalComments: number;
    answerPagination: AnswerPaginationState;
    aiSummary: AiSummaryContent | null;
    relatedConcepts: RelatedConcept[];
    learningResources: LearningResource[];
    similarQuestions: SimilarQuestion[];
    isDeletingQuestion: boolean;
    isQuestionAuthor: boolean;
    getVoteStatus: (type: CommentTargetType, typeId: string) => VoteStatus | null | undefined;
    ensureVoteState: (type: CommentTargetType, typeId: string) => Promise<VoteStatus | null>;
    getAnswerScore: (answer: AnswerDoc) => number;
    voteQuestion: (status: VoteStatus) => Promise<void>;
    voteAnswer: (answerId: string, status: VoteStatus) => Promise<void>;
    acceptAnswer: (answerId: string) => Promise<void>;
    submitAnswer: (content: string) => Promise<boolean>;
    deleteAnswer: (answerId: string) => Promise<boolean>;
    addComment: (type: CommentTargetType, typeId: string, content: string) => Promise<boolean>;
    deleteComment: (type: CommentTargetType, typeId: string, commentId: string) => Promise<boolean>;
    deleteQuestion: () => Promise<boolean>;
    hydrateDynamic: (
        dynamicAnswers: { total: number; documents: AnswerDoc[] },
        dynamicComments: { total: number; documents: CommentDoc[] }
    ) => void;
}

interface ApiErrorShape {
    message?: string;
    error?: string;
}

interface VoteLookupResponse {
    data: {
        document: VoteDocument | null;
        totalVotes?: number;
    };
}

interface VoteBatchLookupResponse {
    data: {
        documents: Array<{ typeId: string; voteStatus: VoteStatus }>;
    };
}

interface VoteMutationResponse {
    data: {
        document: VoteDocument | null;
        voteResult: number;
    };
    message?: string;
}

interface CommentMutationResponse {
    data: CommentDoc;
}

const QuestionDetailContext = React.createContext<QuestionDetailContextValue | null>(null);

export function QuestionDetailProvider({
    question,
    author,
    currentUser,
    answers: initialAnswers,
    upvotes,
    downvotes,
    comments: initialComments,
    attachmentUrl,
    aiSummary = null,
    relatedConcepts = [],
    learningResources = [],
    similarQuestions = [],
    answerPagination,
    children,
}: QuestionDetailProviderProps) {
    const router = useRouter();
    const [answers, setAnswers] = React.useState<DocumentList<AnswerDoc>>(initialAnswers);
    const [questionComments, setQuestionComments] =
        React.useState<DocumentList<CommentDoc>>(initialComments);
    const [answerSort, setAnswerSort] = React.useState<AnswerSort>("Votes");
    const [answerComposerOpen, setAnswerComposerOpen] = React.useState(false);
    const [questionVoteScore, setQuestionVoteScore] = React.useState(
        upvotes.total - downvotes.total
    );
    const [answerVoteScores, setAnswerVoteScores] = React.useState<Record<string, number>>(() =>
        Object.fromEntries(
            initialAnswers.documents.map((answer) => [answer.$id, getInitialAnswerScore(answer)])
        )
    );
    const [voteStatusByTarget, setVoteStatusByTarget] = React.useState<
        Record<string, VoteStatus | null | undefined>
    >({});
    const [isDeletingQuestion, setIsDeletingQuestion] = React.useState(false);

    const pendingVoteLookups = React.useRef<Set<string>>(new Set());
    const voteAbortControllers = React.useRef<Map<string, AbortController>>(new Map());

    // Whether the current user is the question author (controls accept button visibility).
    const isQuestionAuthor = currentUser?.$id === question.authorId;

    const questionTags = React.useMemo(
        () => (Array.isArray(question.tags) ? question.tags.filter(Boolean) : []),
        [question.tags]
    );
    const totalViews = Number(question.views ?? question.totalViews ?? 0);
    const collectiveLabel = questionTags[0]
        ? `${formatCollectiveName(questionTags[0])} Collective`
        : "ByteNest Collective";

    const getAnswerScore = React.useCallback(
        (answer: AnswerDoc) => answerVoteScores[answer.$id] ?? getInitialAnswerScore(answer),
        [answerVoteScores]
    );

    const sortedAnswers = React.useMemo(() => {
        return [...answers.documents].sort((a, b) => {
            // Accepted answer always floats to the top regardless of sort mode.
            if (a.isAccepted && !b.isAccepted) return -1;
            if (!a.isAccepted && b.isAccepted) return 1;

            if (answerSort === "Oldest") {
                return new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime();
            }
            if (answerSort === "Active") {
                return new Date(b.$updatedAt).getTime() - new Date(a.$updatedAt).getTime();
            }
            return getAnswerScore(b) - getAnswerScore(a);
        });
    }, [answers.documents, answerSort, getAnswerScore]);

    // bestAnswer is the explicitly accepted one — NOT just the top vote-getter.
    const bestAnswer = React.useMemo(
        () => answers.documents.find((a) => a.isAccepted) ?? null,
        [answers.documents]
    );

    const communityAnswers = React.useMemo(
        () =>
            bestAnswer
                ? sortedAnswers.filter((answer) => answer.$id !== bestAnswer.$id)
                : sortedAnswers,
        [bestAnswer, sortedAnswers]
    );

    const totalAnswerComments = React.useMemo(
        () =>
            answers.documents.reduce(
                (total, answer) => total + Number(answer.comments?.total ?? 0),
                0
            ),
        [answers.documents]
    );

    const totalComments = questionComments.total + totalAnswerComments;

    const normalizedAnswerPagination = React.useMemo<AnswerPaginationState>(() => {
        const loaded = answers.documents.length;
        return {
            total: answers.total,
            loaded,
            hasMore: answerPagination?.hasMore ?? loaded < answers.total,
            nextCursor: answerPagination?.nextCursor ?? null,
        };
    }, [
        answerPagination?.hasMore,
        answerPagination?.nextCursor,
        answers.documents.length,
        answers.total,
    ]);

    const getVoteStatus = React.useCallback(
        (type: CommentTargetType, typeId: string) =>
            voteStatusByTarget[targetKey(type, typeId)],
        [voteStatusByTarget]
    );

    const ensureVoteState = React.useCallback(
        async (type: CommentTargetType, typeId: string) => {
            const key = targetKey(type, typeId);

            const cached = voteStatusByTarget[key];
            if (cached !== undefined) return cached;
            if (pendingVoteLookups.current.has(key)) return null;

            pendingVoteLookups.current.add(key);
            try {
                const params = new URLSearchParams({
                    type,
                    typeId,
                    ...(currentUser && { votedById: currentUser.$id }),
                });
                const response = await apiFetch<VoteLookupResponse>(
                    `/api/vote?${params.toString()}`
                );

                if (type === "question" && response.data.totalVotes !== undefined) {
                    setQuestionVoteScore(response.data.totalVotes);
                }

                const status = response.data.document?.voteStatus ?? null;
                setVoteStatusByTarget((prev) => ({ ...prev, [key]: status }));
                return status;
            } catch (error) {
                setVoteStatusByTarget((prev) => ({ ...prev, [key]: null }));
                console.error("Unable to load vote state:", error);
                return null;
            } finally {
                pendingVoteLookups.current.delete(key);
            }
        },
        [currentUser, voteStatusByTarget]
    );

    const ensureAnswerVoteStates = React.useCallback(
        async (answerIds: string[]) => {
            if (!currentUser || answerIds.length === 0) return;

            const unknown = answerIds.filter(
                (id) => voteStatusByTarget[targetKey("answer", id)] === undefined
            );
            if (unknown.length === 0) return;

            unknown.forEach((id) =>
                pendingVoteLookups.current.add(targetKey("answer", id))
            );

            try {
                const params = new URLSearchParams({
                    type: "answer",
                    typeIds: unknown.join(","),
                    votedById: currentUser.$id,
                });
                const response = await apiFetch<VoteBatchLookupResponse>(
                    `/api/vote/batch?${params.toString()}`
                );

                const resultMap = new Map<string, VoteStatus | null>(
                    unknown.map((id) => [id, null])
                );
                for (const doc of response.data.documents) {
                    resultMap.set(doc.typeId, doc.voteStatus);
                }

                setVoteStatusByTarget((prev) => {
                    const next = { ...prev };
                    resultMap.forEach((status, id) => {
                        next[targetKey("answer", id)] = status;
                    });
                    return next;
                });
            } catch (error) {
                setVoteStatusByTarget((prev) => {
                    const next = { ...prev };
                    unknown.forEach((id) => {
                        next[targetKey("answer", id)] = null;
                    });
                    return next;
                });
                toast.error(getErrorMessage(error, "Unable to load vote states"));
            } finally {
                unknown.forEach((id) =>
                    pendingVoteLookups.current.delete(targetKey("answer", id))
                );
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [currentUser]
    );

    React.useEffect(() => {
        setVoteStatusByTarget({});
        pendingVoteLookups.current.clear();
        voteAbortControllers.current.forEach((ctrl) => ctrl.abort());
        voteAbortControllers.current.clear();
    }, [currentUser?.$id]);

    React.useEffect(() => {
        void ensureVoteState("question", question.$id);
    }, [currentUser, ensureVoteState, question.$id]);

    React.useEffect(() => {
        if (!currentUser) return;
        const ids = answers.documents.map((a) => a.$id);
        void ensureAnswerVoteStates(ids);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.$id, answers.documents]);

    // ── Vote mutations ────────────────────────────────────────────────────

    const voteQuestion = React.useCallback(
        async (status: VoteStatus) => {
            if (!currentUser) {
                router.push("/login");
                return;
            }

            const key = targetKey("question", question.$id);
            const previousStatus =
                voteStatusByTarget[key] ??
                (await ensureVoteState("question", question.$id));
            const nextStatus = previousStatus === status ? null : status;
            const previousScore = questionVoteScore;

            setVoteStatusByTarget((prev) => ({ ...prev, [key]: nextStatus }));
            setQuestionVoteScore((score) => score + voteDelta(previousStatus, nextStatus));

            const existing = voteAbortControllers.current.get(key);
            existing?.abort();
            const controller = new AbortController();
            voteAbortControllers.current.set(key, controller);

            try {
                const response = await apiFetch<VoteMutationResponse>("/api/vote", {
                    method: "POST",
                    body: JSON.stringify({
                        votedById: currentUser.$id,
                        voteStatus: status,
                        type: "question",
                        typeId: question.$id,
                    }),
                    signal: controller.signal,
                });

                setQuestionVoteScore(response.data.voteResult);
                setVoteStatusByTarget((prev) => ({
                    ...prev,
                    [key]: response.data.document?.voteStatus ?? null,
                }));
            } catch (error) {
                if (isAbortError(error)) return;
                setQuestionVoteScore(previousScore);
                setVoteStatusByTarget((prev) => ({ ...prev, [key]: previousStatus }));
                toast.error(getErrorMessage(error, "Vote failed"));
            } finally {
                if (voteAbortControllers.current.get(key) === controller) {
                    voteAbortControllers.current.delete(key);
                }
            }
        },
        [
            currentUser,
            ensureVoteState,
            question.$id,
            questionVoteScore,
            router,
            voteStatusByTarget,
        ]
    );

    const voteAnswer = React.useCallback(
        async (answerId: string, status: VoteStatus) => {
            if (!currentUser) {
                router.push("/login");
                return;
            }

            const key = targetKey("answer", answerId);
            const previousStatus =
                voteStatusByTarget[key] ??
                (await ensureVoteState("answer", answerId));
            const nextStatus = previousStatus === status ? null : status;
            const previousScore = answerVoteScores[answerId] ?? 0;

            setVoteStatusByTarget((prev) => ({ ...prev, [key]: nextStatus }));
            setAnswerVoteScores((prev) => ({
                ...prev,
                [answerId]:
                    (prev[answerId] ?? previousScore) + voteDelta(previousStatus, nextStatus),
            }));

            const existing = voteAbortControllers.current.get(key);
            existing?.abort();
            const controller = new AbortController();
            voteAbortControllers.current.set(key, controller);

            try {
                const response = await apiFetch<VoteMutationResponse>("/api/vote", {
                    method: "POST",
                    body: JSON.stringify({
                        votedById: currentUser.$id,
                        voteStatus: status,
                        type: "answer",
                        typeId: answerId,
                    }),
                    signal: controller.signal,
                });

                setAnswerVoteScores((prev) => ({
                    ...prev,
                    [answerId]: response.data.voteResult,
                }));
                setVoteStatusByTarget((prev) => ({
                    ...prev,
                    [key]: response.data.document?.voteStatus ?? null,
                }));
            } catch (error) {
                if (isAbortError(error)) return;
                setAnswerVoteScores((prev) => ({ ...prev, [answerId]: previousScore }));
                setVoteStatusByTarget((prev) => ({ ...prev, [key]: previousStatus }));
                toast.error(getErrorMessage(error, "Vote failed"));
            } finally {
                if (voteAbortControllers.current.get(key) === controller) {
                    voteAbortControllers.current.delete(key);
                }
            }
        },
        [
            answerVoteScores,
            currentUser,
            ensureVoteState,
            router,
            voteStatusByTarget,
        ]
    );

    // ── Accept answer ─────────────────────────────────────────────────────

    const acceptAnswer = React.useCallback(
        async (answerId: string) => {
            if (!currentUser) {
                router.push("/login");
                return;
            }
            if (!isQuestionAuthor) {
                toast.error("Only the question author can accept an answer");
                return;
            }

            // Current accepted state for this answer.
            const current = answers.documents.find((a) => a.$id === answerId);
            if (!current) return;

            const willAccept = !current.isAccepted;

            // Optimistic update: flip the target; clear all others.
            setAnswers((prev) => ({
                ...prev,
                documents: prev.documents.map((a) => ({
                    ...a,
                    isAccepted: a.$id === answerId ? willAccept : willAccept ? false : a.isAccepted,
                })),
            }));

            try {
                await apiFetch("/api/answer", {
                    method: "PATCH",
                    body: JSON.stringify({
                        answerId,
                        questionId: question.$id,
                        requesterId: currentUser.$id,
                        accept: willAccept,
                    }),
                });
                toast.success(willAccept ? "Answer accepted" : "Acceptance removed");
            } catch (error) {
                // Roll back optimistic update.
                setAnswers((prev) => ({
                    ...prev,
                    documents: prev.documents.map((a) => ({
                        ...a,
                        isAccepted: a.$id === answerId ? !willAccept : a.isAccepted,
                    })),
                }));
                toast.error(getErrorMessage(error, "Failed to update accepted answer"));
            }
        },
        [answers.documents, currentUser, isQuestionAuthor, question.$id, router]
    );

    // ── Answer CRUD ───────────────────────────────────────────────────────

    const submitAnswer = React.useCallback(
        async (content: string) => {
            if (!currentUser) {
                router.push("/login");
                return false;
            }

            const trimmed = content.trim();
            if (!trimmed) return false;

            const optimisticId = `optimistic-answer-${crypto.randomUUID()}`;
            const optimisticAnswer = createOptimisticAnswer(
                trimmed,
                question.$id,
                currentUser,
                optimisticId
            );
            setAnswers((prev) => ({
                total: prev.total + 1,
                documents: [optimisticAnswer, ...prev.documents],
            }));
            setAnswerVoteScores((prev) => ({ ...prev, [optimisticId]: 0 }));

            try {
                const createdAnswer = await apiFetch<AnswerDoc>("/api/answer", {
                    method: "POST",
                    body: JSON.stringify({
                        questionId: question.$id,
                        answer: trimmed,
                        authorId: currentUser.$id,
                    }),
                });

                const hydratedAnswer = hydrateAnswer(createdAnswer, currentUser);
                setAnswers((prev) => ({
                    total: prev.total,
                    documents: prev.documents.map((answer) =>
                        answer.$id === optimisticId ? hydratedAnswer : answer
                    ),
                }));
                setAnswerVoteScores((prev) => {
                    const next = { ...prev };
                    delete next[optimisticId];
                    next[hydratedAnswer.$id] = 0;
                    return next;
                });
                toast.success("Answer posted");
                return true;
            } catch (error) {
                setAnswers((prev) => ({
                    total: Math.max(prev.total - 1, 0),
                    documents: prev.documents.filter((answer) => answer.$id !== optimisticId),
                }));
                setAnswerVoteScores((prev) => {
                    const next = { ...prev };
                    delete next[optimisticId];
                    return next;
                });
                toast.error(getErrorMessage(error, "Failed to post answer"));
                return false;
            }
        },
        [currentUser, question.$id, router]
    );

    const deleteAnswer = React.useCallback(
        async (answerId: string) => {
            const answer = answers.documents.find((item) => item.$id === answerId);
            if (!answer) return false;

            setAnswers((prev) => ({
                total: Math.max(prev.total - 1, 0),
                documents: prev.documents.filter((item) => item.$id !== answerId),
            }));

            try {
                await apiFetch<{ data: unknown }>("/api/answer", {
                    method: "DELETE",
                    body: JSON.stringify({ answerId, authorId: currentUser?.$id }),
                });
                toast.success("Answer deleted");
                return true;
            } catch (error) {
                setAnswers((prev) => ({
                    total: prev.total + 1,
                    documents: [answer, ...prev.documents],
                }));
                toast.error(getErrorMessage(error, "Failed to delete answer"));
                return false;
            }
        },
        [answers.documents, currentUser?.$id]
    );

    // ── Comments ──────────────────────────────────────────────────────────

    const addComment = React.useCallback(
        async (type: CommentTargetType, typeId: string, content: string) => {
            if (!currentUser) {
                router.push("/login");
                return false;
            }

            const trimmed = content.trim();
            if (!trimmed) return false;

            const optimisticId = `optimistic-comment-${crypto.randomUUID()}`;
            const optimisticComment = createOptimisticComment(
                trimmed,
                type,
                typeId,
                currentUser,
                optimisticId
            );
            addCommentToState(type, typeId, optimisticComment, setQuestionComments, setAnswers);

            try {
                const response = await apiFetch<CommentMutationResponse>("/api/comment", {
                    method: "POST",
                    body: JSON.stringify({
                        content: trimmed,
                        authorId: currentUser.$id,
                        type,
                        typeId,
                    }),
                });

                replaceCommentInState(
                    type,
                    typeId,
                    optimisticId,
                    response.data,
                    setQuestionComments,
                    setAnswers
                );
                toast.success("Comment posted");
                return true;
            } catch (error) {
                removeCommentFromState(
                    type,
                    typeId,
                    optimisticId,
                    setQuestionComments,
                    setAnswers
                );
                toast.error(getErrorMessage(error, "Failed to post comment"));
                return false;
            }
        },
        [currentUser, router]
    );

    const deleteComment = React.useCallback(
        async (type: CommentTargetType, typeId: string, commentId: string) => {
            const comment = findComment(type, typeId, commentId, questionComments, answers);
            if (!comment) return false;

            removeCommentFromState(type, typeId, commentId, setQuestionComments, setAnswers);

            try {
                await apiFetch<{ data: unknown }>("/api/comment", {
                    method: "DELETE",
                    body: JSON.stringify({ commentId, authorId: currentUser?.$id }),
                });
                toast.success("Comment deleted");
                return true;
            } catch (error) {
                addCommentToState(type, typeId, comment, setQuestionComments, setAnswers);
                toast.error(getErrorMessage(error, "Failed to delete comment"));
                return false;
            }
        },
        [answers, currentUser?.$id, questionComments]
    );

    const deleteQuestion = React.useCallback(async () => {
        if (!currentUser) {
            router.push("/login");
            return false;
        }

        setIsDeletingQuestion(true);
        try {
            await apiFetch<{ data: unknown }>("/api/question", {
                method: "DELETE",
                body: JSON.stringify({
                    questionId: question.$id,
                    authorId: currentUser.$id,
                }),
            });
            toast.success("Question deleted");
            router.push("/questions");
            return true;
        } catch (error) {
            toast.error(getErrorMessage(error, "Failed to delete question"));
            return false;
        } finally {
            setIsDeletingQuestion(false);
        }
    }, [currentUser, question.$id, router]);

    const openAnswerComposer = React.useCallback(() => {
        if (!currentUser) {
            router.push("/login");
            return;
        }
        setAnswerComposerOpen(true);
    }, [currentUser, router]);

    const closeAnswerComposer = React.useCallback(() => {
        setAnswerComposerOpen(false);
    }, []);

    const hydrateDynamic = React.useCallback(
        (
            dynamicAnswers: { total: number; documents: AnswerDoc[] },
            dynamicComments: { total: number; documents: CommentDoc[] }
        ) => {
            setAnswers(dynamicAnswers);
            setQuestionComments(dynamicComments);
            setAnswerVoteScores(
                Object.fromEntries(
                    dynamicAnswers.documents.map((answer) => [
                        answer.$id,
                        getInitialAnswerScore(answer),
                    ])
                )
            );
        },
        []
    );

    const value = React.useMemo<QuestionDetailContextValue>(
        () => ({
            question,
            author,
            currentUser,
            attachmentUrl,
            questionTags,
            totalViews,
            collectiveLabel,
            questionVoteScore,
            answerVoteScores,
            answerSort,
            setAnswerSort,
            answerComposerOpen,
            openAnswerComposer,
            closeAnswerComposer,
            answers,
            sortedAnswers,
            bestAnswer,
            communityAnswers,
            questionComments,
            totalComments,
            answerPagination: normalizedAnswerPagination,
            aiSummary,
            relatedConcepts,
            learningResources,
            similarQuestions,
            isDeletingQuestion,
            isQuestionAuthor,
            getVoteStatus,
            ensureVoteState,
            getAnswerScore,
            voteQuestion,
            voteAnswer,
            acceptAnswer,
            submitAnswer,
            deleteAnswer,
            addComment,
            deleteComment,
            deleteQuestion,
            hydrateDynamic,
        }),
        [
            question,
            author,
            currentUser,
            attachmentUrl,
            questionTags,
            totalViews,
            collectiveLabel,
            questionVoteScore,
            answerVoteScores,
            answerSort,
            answerComposerOpen,
            answers,
            sortedAnswers,
            bestAnswer,
            communityAnswers,
            questionComments,
            totalComments,
            normalizedAnswerPagination,
            aiSummary,
            relatedConcepts,
            learningResources,
            similarQuestions,
            isDeletingQuestion,
            isQuestionAuthor,
            getVoteStatus,
            ensureVoteState,
            getAnswerScore,
            voteQuestion,
            voteAnswer,
            acceptAnswer,
            submitAnswer,
            deleteAnswer,
            addComment,
            deleteComment,
            deleteQuestion,
            openAnswerComposer,
            closeAnswerComposer,
            hydrateDynamic,
        ]
    );

    return (
        <QuestionDetailContext.Provider value={value}>
            {children}
        </QuestionDetailContext.Provider>
    );
}

export function useQuestionDetail() {
    const context = React.useContext(QuestionDetailContext);
    if (!context) {
        throw new Error("useQuestionDetail must be used inside QuestionDetailProvider");
    }
    return context;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export function getInitials(name: string) {
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("") || "?"
    );
}

export function formatCount(value: number) {
    return new Intl.NumberFormat("en", {
        notation: Math.abs(value) >= 1000 ? "compact" : "standard",
        maximumFractionDigits: 1,
    }).format(value);
}

export function formatCollectiveName(tag: string) {
    return tag
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) =>
            part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)
        )
        .join(" ");
}

// ─── Private helpers ──────────────────────────────────────────────────────────


function extractApiError(payload: ApiErrorShape | unknown, fallback: string) {
    if (isApiErrorShape(payload)) {
        return payload.message ?? payload.error ?? fallback;
    }
    return fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
    if (isAbortError(error)) return fallback;
    if (error instanceof Error && error.message) return error.message;
    if (isApiErrorShape(error)) return error.message ?? error.error ?? fallback;
    return fallback;
}

function isApiErrorShape(value: unknown): value is ApiErrorShape {
    return (
        typeof value === "object" &&
        value !== null &&
        ("message" in value || "error" in value)
    );
}

function isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
}

function targetKey(type: CommentTargetType, typeId: string) {
    return `${type}:${typeId}`;
}

function statusWeight(status: VoteStatus | null | undefined) {
    if (status === "upvoted") return 1;
    if (status === "downvoted") return -1;
    return 0;
}

function voteDelta(
    previous: VoteStatus | null | undefined,
    next: VoteStatus | null | undefined
) {
    return statusWeight(next) - statusWeight(previous);
}

function getInitialAnswerScore(answer: AnswerDoc) {
    return (
        Number(answer.upvotesDocuments?.total ?? 0) -
        Number(answer.downvotesDocuments?.total ?? 0)
    );
}

function authorFromUser(user: CurrentUser): Author {
    return {
        $id: user.$id,
        name: user.name,
        reputation: Number(user.prefs?.reputation ?? 0),
    };
}

function createOptimisticAnswer(
    content: string,
    questionId: string,
    user: CurrentUser,
    id: string
): AnswerDoc {
    const now = new Date().toISOString();
    return {
        $id: id,
        $createdAt: now,
        $updatedAt: now,
        content,
        questionId,
        authorId: user.$id,
        author: authorFromUser(user),
        isAccepted: false,
        upvotesDocuments: { total: 0, documents: [] },
        downvotesDocuments: { total: 0, documents: [] },
        comments: { total: 0, documents: [] },
        optimistic: true,
    };
}

function hydrateAnswer(answer: AnswerDoc, user: CurrentUser): AnswerDoc {
    return {
        ...answer,
        author: answer.author ?? authorFromUser(user),
        isAccepted: answer.isAccepted ?? false,
        upvotesDocuments: answer.upvotesDocuments ?? { total: 0, documents: [] },
        downvotesDocuments: answer.downvotesDocuments ?? { total: 0, documents: [] },
        comments: answer.comments ?? { total: 0, documents: [] },
    };
}

function createOptimisticComment(
    content: string,
    type: CommentTargetType,
    typeId: string,
    user: CurrentUser,
    id: string
): CommentDoc {
    const now = new Date().toISOString();
    return {
        $id: id,
        $createdAt: now,
        $updatedAt: now,
        content,
        type,
        typeId,
        authorId: user.$id,
        author: authorFromUser(user),
        optimistic: true,
    };
}

function addCommentToState(
    type: CommentTargetType,
    typeId: string,
    comment: CommentDoc,
    setQuestionComments: React.Dispatch<React.SetStateAction<DocumentList<CommentDoc>>>,
    setAnswers: React.Dispatch<React.SetStateAction<DocumentList<AnswerDoc>>>
) {
    if (type === "question") {
        setQuestionComments((prev) => ({
            total: prev.total + 1,
            documents: [comment, ...prev.documents],
        }));
        return;
    }

    setAnswers((prev) => ({
        ...prev,
        documents: prev.documents.map((answer) =>
            answer.$id === typeId
                ? {
                      ...answer,
                      comments: {
                          total: answer.comments.total + 1,
                          documents: [comment, ...answer.comments.documents],
                      },
                  }
                : answer
        ),
    }));
}

function replaceCommentInState(
    type: CommentTargetType,
    typeId: string,
    commentId: string,
    replacement: CommentDoc,
    setQuestionComments: React.Dispatch<React.SetStateAction<DocumentList<CommentDoc>>>,
    setAnswers: React.Dispatch<React.SetStateAction<DocumentList<AnswerDoc>>>
) {
    if (type === "question") {
        setQuestionComments((prev) => ({
            ...prev,
            documents: prev.documents.map((comment) =>
                comment.$id === commentId ? replacement : comment
            ),
        }));
        return;
    }

    setAnswers((prev) => ({
        ...prev,
        documents: prev.documents.map((answer) =>
            answer.$id === typeId
                ? {
                      ...answer,
                      comments: {
                          ...answer.comments,
                          documents: answer.comments.documents.map((comment) =>
                              comment.$id === commentId ? replacement : comment
                          ),
                      },
                  }
                : answer
        ),
    }));
}

function removeCommentFromState(
    type: CommentTargetType,
    typeId: string,
    commentId: string,
    setQuestionComments: React.Dispatch<React.SetStateAction<DocumentList<CommentDoc>>>,
    setAnswers: React.Dispatch<React.SetStateAction<DocumentList<AnswerDoc>>>
) {
    if (type === "question") {
        setQuestionComments((prev) => ({
            total: Math.max(prev.total - 1, 0),
            documents: prev.documents.filter((comment) => comment.$id !== commentId),
        }));
        return;
    }

    setAnswers((prev) => ({
        ...prev,
        documents: prev.documents.map((answer) =>
            answer.$id === typeId
                ? {
                      ...answer,
                      comments: {
                          total: Math.max(answer.comments.total - 1, 0),
                          documents: answer.comments.documents.filter(
                              (comment) => comment.$id !== commentId
                          ),
                      },
                  }
                : answer
        ),
    }));
}

function findComment(
    type: CommentTargetType,
    typeId: string,
    commentId: string,
    questionComments: DocumentList<CommentDoc>,
    answers: DocumentList<AnswerDoc>
) {
    if (type === "question") {
        return (
            questionComments.documents.find((comment) => comment.$id === commentId) ?? null
        );
    }

    return (
        answers.documents
            .find((answer) => answer.$id === typeId)
            ?.comments.documents.find((comment) => comment.$id === commentId) ?? null
    );
}
