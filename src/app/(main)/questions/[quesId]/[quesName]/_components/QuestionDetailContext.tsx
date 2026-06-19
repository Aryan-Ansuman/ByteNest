"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useAuthStore } from "@/store/Auth";

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
    totalVotes?: number;
    totalAnswers?: number;
    acceptedAnswerId?: string | null;
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
    parentId?: string | null;
    authorId: string;
    author: Author;
    isDeleted?: boolean;
    optimistic?: boolean;
}

export interface AnswerDoc extends AppDocument {
    content: string;
    questionId: string;
    authorId: string;
    author: Author;
    /** True only when the question author explicitly marked this answer accepted. */
    isAccepted: boolean;
    totalVotes?: number;
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
    acceptingAnswerId: string | null;
    isQuestionAuthor: boolean;
    getVoteStatus: (type: CommentTargetType, typeId: string) => VoteStatus | null | undefined;
    ensureVoteState: (type: CommentTargetType, typeId: string) => Promise<VoteStatus | null>;
    getAnswerScore: (answer: AnswerDoc) => number;
    voteQuestion: (status: VoteStatus) => Promise<void>;
    voteAnswer: (answerId: string, status: VoteStatus) => Promise<void>;
    acceptAnswer: (answerId: string) => Promise<void>;
    submitAnswer: (content: string) => Promise<boolean>;
    deleteAnswer: (answerId: string) => Promise<boolean>;
    addComment: (
        type: CommentTargetType,
        typeId: string,
        content: string,
        parentId?: string | null
    ) => Promise<boolean>;
    deleteComment: (type: CommentTargetType, typeId: string, commentId: string) => Promise<boolean>;
    deleteQuestion: () => Promise<boolean>;
    hydrateDynamic: (
        dynamicAnswers: { total: number; documents: AnswerDoc[] },
        dynamicComments: { total: number; documents: CommentDoc[] },
        dynamicPagination?: Partial<AnswerPaginationState>,
        dynamicAcceptedAnswerId?: string | null
    ) => void;
    appendDynamicAnswers: (
        dynamicAnswers: { total: number; documents: AnswerDoc[] },
        dynamicComments: { total: number; documents: CommentDoc[] },
        dynamicPagination?: Partial<AnswerPaginationState>,
        dynamicAcceptedAnswerId?: string | null
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
    const [answers, setAnswers] = React.useState<DocumentList<AnswerDoc>>(() => ({
        ...initialAnswers,
        documents: enforceSingleAcceptedAnswer(initialAnswers.documents),
    }));
    const [questionComments, setQuestionComments] =
        React.useState<DocumentList<CommentDoc>>(initialComments);
        
    const userPrefs = useAuthStore((s) => s.user?.prefs);
    const updateAnswerSortStore = useAuthStore((s) => s.updateAnswerSort);
    
    const [answerSort, setAnswerSortState] = React.useState<AnswerSort>("Votes");
    const [paginationOverride, setPaginationOverride] =
        React.useState<Partial<AnswerPaginationState> | null>(answerPagination ?? null);
    const [answerComposerOpen, setAnswerComposerOpen] = React.useState(false);
    const [acceptedAnswerId, setAcceptedAnswerId] = React.useState<string | null>(() =>
        getInitialAcceptedAnswerId(question, initialAnswers.documents)
    );
    const [questionVoteScore, setQuestionVoteScore] = React.useState(() =>
        getInitialQuestionScore(question, upvotes, downvotes)
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
    const [acceptingAnswerId, setAcceptingAnswerId] = React.useState<string | null>(null);

    const pendingVoteLookups = React.useRef<Set<string>>(new Set());
    const voteAbortControllers = React.useRef<Map<string, AbortController>>(new Map());

    // Whether the current user is the question author (controls accept button visibility).
    const isQuestionAuthor = currentUser?.$id === question.authorId;

    React.useEffect(() => {
        if (userPrefs?.defaultAnswerSort && isAnswerSort(userPrefs.defaultAnswerSort)) {
            setAnswerSortState(userPrefs.defaultAnswerSort as AnswerSort);
        }
    }, [userPrefs?.defaultAnswerSort]);

    const setAnswerSort = React.useCallback(
        (sort: AnswerSort) => {
            setAnswerSortState(sort);
            if (currentUser) {
                updateAnswerSortStore(sort).catch(console.error);
            }
        },
        [currentUser, updateAnswerSortStore]
    );

    const promptSignIn = React.useCallback(
        (title: string) => {
            toast.warning(title, {
                description: "Your current draft will stay here until you choose to leave.",
                action: {
                    label: "Sign in",
                    onClick: () => router.push("/login"),
                },
            });
        },
        [router]
    );

    const questionTags = React.useMemo(
        () => (Array.isArray(question.tags) ? question.tags.filter(Boolean) : []),
        [question.tags]
    );
    const totalViews = Number(question.views ?? question.totalViews ?? 0);
    const collectiveLabel = questionTags[0]
        ? `${formatCollectiveName(questionTags[0])} Collective`
        : "ByteNest Collective";

    const displayAnswers = React.useMemo(
        () => answers.documents.map((answer) => withAcceptedState(answer, acceptedAnswerId)),
        [acceptedAnswerId, answers.documents]
    );

    const getAnswerScore = React.useCallback(
        (answer: AnswerDoc) => answerVoteScores[answer.$id] ?? getInitialAnswerScore(answer),
        [answerVoteScores]
    );

    const sortedAnswers = React.useMemo(() => {
        return [...displayAnswers].sort((a, b) => {
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
    }, [displayAnswers, answerSort, getAnswerScore]);

    // bestAnswer is the explicitly accepted one — NOT just the top vote-getter.
    const bestAnswer = React.useMemo(
        () => (acceptedAnswerId ? displayAnswers.find((a) => a.$id === acceptedAnswerId) ?? null : null),
        [acceptedAnswerId, displayAnswers]
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
            displayAnswers.reduce(
                (total, answer) => total + Number(answer.comments?.total ?? 0),
                0
            ),
        [displayAnswers]
    );

    const totalComments = questionComments.total + totalAnswerComments;

    const normalizedAnswerPagination = React.useMemo<AnswerPaginationState>(() => {
        const loaded = answers.documents.length;
        return {
            total: answers.total,
            loaded,
            hasMore: paginationOverride?.hasMore ?? loaded < answers.total,
            nextCursor: paginationOverride?.nextCursor ?? null,
        };
    }, [
        paginationOverride?.hasMore,
        paginationOverride?.nextCursor,
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
        const ids = displayAnswers.map((a) => a.$id);
        void ensureAnswerVoteStates(ids);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser?.$id, displayAnswers]);

    // ── Vote mutations ────────────────────────────────────────────────────

    const voteQuestion = React.useCallback(
        async (status: VoteStatus) => {
            if (isDeletingQuestion) {
                toast("This question is being deleted");
                return;
            }
            if (!currentUser) {
                promptSignIn("Sign in to vote");
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
            isDeletingQuestion,
            promptSignIn,
            question.$id,
            questionVoteScore,
            voteStatusByTarget,
        ]
    );

    const voteAnswer = React.useCallback(
        async (answerId: string, status: VoteStatus) => {
            if (isDeletingQuestion) {
                toast("This question is being deleted");
                return;
            }
            if (!currentUser) {
                promptSignIn("Sign in to vote");
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
            isDeletingQuestion,
            promptSignIn,
            voteStatusByTarget,
        ]
    );

    // ── Accept answer ─────────────────────────────────────────────────────

    const acceptAnswer = React.useCallback(
        async (answerId: string) => {
            if (isDeletingQuestion) {
                toast("This question is being deleted");
                return;
            }
            if (acceptingAnswerId) return;
            if (!currentUser) {
                promptSignIn("Sign in to accept an answer");
                return;
            }
            if (!isQuestionAuthor) {
                toast.error("Only the question author can accept an answer");
                return;
            }

            // Current accepted state for this answer.
            const current = answers.documents.find((a) => a.$id === answerId);
            if (!current) return;

            const willAccept = acceptedAnswerId !== answerId;
            const previousAcceptedAnswerId = acceptedAnswerId;

            // Optimistic update: flip the target; clear all others.
            setAcceptingAnswerId(answerId);
            setAcceptedAnswerId(willAccept ? answerId : null);
            setAnswers((prev) => ({
                ...prev,
                documents: prev.documents.map((a) => ({
                    ...a,
                    isAccepted: willAccept ? a.$id === answerId : false,
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
                setAcceptedAnswerId(previousAcceptedAnswerId);
                setAnswers((prev) => ({
                    ...prev,
                    documents: prev.documents.map((a) => ({
                        ...a,
                        isAccepted: previousAcceptedAnswerId === a.$id,
                    })),
                }));
                toast.error(getErrorMessage(error, "Failed to update accepted answer"));
            } finally {
                setAcceptingAnswerId(null);
            }
        },
        [
            acceptingAnswerId,
            acceptedAnswerId,
            answers.documents,
            currentUser,
            isDeletingQuestion,
            isQuestionAuthor,
            promptSignIn,
            question.$id,
        ]
    );

    // ── Answer CRUD ───────────────────────────────────────────────────────

    const submitAnswer = React.useCallback(
        async (content: string) => {
            if (isDeletingQuestion) {
                toast("This question is being deleted");
                return false;
            }
            if (!currentUser) {
                promptSignIn("Sign in to post an answer");
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
        [currentUser, isDeletingQuestion, promptSignIn, question.$id]
    );

    const deleteAnswer = React.useCallback(
        async (answerId: string) => {
            if (isDeletingQuestion) {
                toast("This question is being deleted");
                return false;
            }
            const answer = answers.documents.find((item) => item.$id === answerId);
            if (!answer) return false;
            const wasAccepted = acceptedAnswerId === answerId;

            setAnswers((prev) => ({
                total: Math.max(prev.total - 1, 0),
                documents: prev.documents.filter((item) => item.$id !== answerId),
            }));
            if (wasAccepted) setAcceptedAnswerId(null);

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
                if (wasAccepted) setAcceptedAnswerId(answerId);
                toast.error(getErrorMessage(error, "Failed to delete answer"));
                return false;
            }
        },
        [acceptedAnswerId, answers.documents, currentUser?.$id, isDeletingQuestion]
    );

    // ── Comments ──────────────────────────────────────────────────────────

    const addComment = React.useCallback(
        async (
            type: CommentTargetType,
            typeId: string,
            content: string,
            parentId?: string | null
        ) => {
            if (isDeletingQuestion) {
                toast("This question is being deleted");
                return false;
            }
            if (!currentUser) {
                promptSignIn("Sign in to comment");
                return false;
            }

            const trimmed = content.trim();
            if (!trimmed) return false;

            const normalizedParentId = parentId?.trim() || null;
            const optimisticId = `optimistic-comment-${crypto.randomUUID()}`;
            const optimisticComment = createOptimisticComment(
                trimmed,
                type,
                typeId,
                currentUser,
                optimisticId,
                normalizedParentId
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
                        parentId: normalizedParentId,
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
                removeCommentsFromState(
                    type,
                    typeId,
                    [optimisticId],
                    setQuestionComments,
                    setAnswers
                );
                toast.error(getErrorMessage(error, "Failed to post comment"));
                return false;
            }
        },
        [currentUser, isDeletingQuestion, promptSignIn]
    );

    const deleteComment = React.useCallback(
        async (type: CommentTargetType, typeId: string, commentId: string) => {
            if (isDeletingQuestion) {
                toast("This question is being deleted");
                return false;
            }
            const commentsToRemove = findCommentSubtree(
                type,
                typeId,
                commentId,
                questionComments,
                answers
            );
            if (commentsToRemove.length === 0) return false;

            removeCommentsFromState(
                type,
                typeId,
                commentsToRemove.map((comment) => comment.$id),
                setQuestionComments,
                setAnswers
            );

            try {
                await apiFetch<{ data: unknown }>("/api/comment", {
                    method: "DELETE",
                    body: JSON.stringify({ commentId, authorId: currentUser?.$id }),
                });
                toast.success("Comment deleted");
                return true;
            } catch (error) {
                addCommentsToState(
                    type,
                    typeId,
                    commentsToRemove,
                    setQuestionComments,
                    setAnswers
                );
                toast.error(getErrorMessage(error, "Failed to delete comment"));
                return false;
            }
        },
        [answers, currentUser?.$id, isDeletingQuestion, questionComments]
    );

    const deleteQuestion = React.useCallback(async () => {
        if (isDeletingQuestion) return false;
        if (!currentUser) {
            promptSignIn("Sign in to delete this question");
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
    }, [currentUser, isDeletingQuestion, promptSignIn, question.$id, router]);

    const openAnswerComposer = React.useCallback(() => {
        if (isDeletingQuestion) {
            toast("This question is being deleted");
            return;
        }
        if (!currentUser) {
            promptSignIn("Sign in to write an answer");
            return;
        }
        setAnswerComposerOpen(true);
    }, [currentUser, isDeletingQuestion, promptSignIn]);

    const closeAnswerComposer = React.useCallback(() => {
        setAnswerComposerOpen(false);
    }, []);

    const hydrateDynamic = React.useCallback(
        (
            dynamicAnswers: { total: number; documents: AnswerDoc[] },
            dynamicComments: { total: number; documents: CommentDoc[] },
            dynamicPagination?: Partial<AnswerPaginationState>,
            dynamicAcceptedAnswerId?: string | null
        ) => {
            if (dynamicAcceptedAnswerId !== undefined) {
                setAcceptedAnswerId(dynamicAcceptedAnswerId);
            }
            setAnswers((prev) =>
                mergeAnswerLists(dynamicAnswers, prev, dynamicAcceptedAnswerId ?? acceptedAnswerId)
            );
            setQuestionComments((prev) => mergeCommentLists(dynamicComments, prev));
            setAnswerVoteScores((prev) => {
                const next = { ...prev };
                for (const answer of dynamicAnswers.documents) {
                    next[answer.$id] = getInitialAnswerScore(answer);
                }
                return next;
            });
            if (dynamicPagination) {
                setPaginationOverride(dynamicPagination);
            }
        },
        [acceptedAnswerId]
    );

    const appendDynamicAnswers = React.useCallback(
        (
            dynamicAnswers: { total: number; documents: AnswerDoc[] },
            dynamicComments: { total: number; documents: CommentDoc[] },
            dynamicPagination?: Partial<AnswerPaginationState>,
            dynamicAcceptedAnswerId?: string | null
        ) => {
            if (dynamicAcceptedAnswerId !== undefined) {
                setAcceptedAnswerId(dynamicAcceptedAnswerId);
            }
            setAnswers((prev) =>
                appendAnswerLists(prev, dynamicAnswers, dynamicAcceptedAnswerId ?? acceptedAnswerId)
            );
            setQuestionComments((prev) => mergeCommentLists(dynamicComments, prev));
            setAnswerVoteScores((prev) => {
                const next = { ...prev };
                for (const answer of dynamicAnswers.documents) {
                    next[answer.$id] = getInitialAnswerScore(answer);
                }
                return next;
            });
            if (dynamicPagination) {
                setPaginationOverride(dynamicPagination);
            }
        },
        [acceptedAnswerId]
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
            acceptingAnswerId,
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
            appendDynamicAnswers,
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
            setAnswerSort,
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
            acceptingAnswerId,
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
            appendDynamicAnswers,
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



function isAnswerSort(value: unknown): value is AnswerSort {
    return value === "Votes" || value === "Active" || value === "Oldest";
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
    if (typeof answer.totalVotes === "number") {
        return Number(answer.totalVotes);
    }

    return (
        Number(answer.upvotesDocuments?.total ?? 0) -
        Number(answer.downvotesDocuments?.total ?? 0)
    );
}

function getInitialQuestionScore(
    question: QuestionDocument,
    upvotes: DocumentList<VoteDocument>,
    downvotes: DocumentList<VoteDocument>
) {
    if (typeof question.totalVotes === "number") {
        return Number(question.totalVotes);
    }

    return upvotes.total - downvotes.total;
}

function getInitialAcceptedAnswerId(question: QuestionDocument, documents: AnswerDoc[]) {
    if (typeof question.acceptedAnswerId === "string" && question.acceptedAnswerId) {
        return question.acceptedAnswerId;
    }
    return documents.find((answer) => answer.isAccepted)?.$id ?? null;
}

function withAcceptedState(answer: AnswerDoc, acceptedAnswerId: string | null): AnswerDoc {
    return {
        ...answer,
        isAccepted: acceptedAnswerId ? answer.$id === acceptedAnswerId : false,
    };
}

function mergeAnswerLists(
    remote: DocumentList<AnswerDoc>,
    local: DocumentList<AnswerDoc>,
    acceptedAnswerId: string | null
): DocumentList<AnswerDoc> {
    const localById = new Map(local.documents.map((answer) => [answer.$id, answer]));
    const remoteIds = new Set(remote.documents.map((answer) => answer.$id));

    const localOnly = local.documents.filter((answer) => !remoteIds.has(answer.$id));
    const mergedRemote = remote.documents.map((answer) => {
        const localAnswer = localById.get(answer.$id);
        if (!localAnswer) return withAcceptedState(hydrateAnswerShape(answer), acceptedAnswerId);

        return withAcceptedState(hydrateAnswerShape({
            ...answer,
            comments: mergeCommentLists(answer.comments, localAnswer.comments),
        }), acceptedAnswerId);
    });

    const documents = [...localOnly.map((answer) => withAcceptedState(answer, acceptedAnswerId)), ...mergedRemote];

    return {
        total: Math.max(remote.total + localOnly.length, documents.length),
        documents,
    };
}

function appendAnswerLists(
    local: DocumentList<AnswerDoc>,
    remote: DocumentList<AnswerDoc>,
    acceptedAnswerId: string | null
): DocumentList<AnswerDoc> {
    const localIds = new Set(local.documents.map((answer) => answer.$id));
    const appended = remote.documents
        .filter((answer) => !localIds.has(answer.$id))
        .map((answer) => withAcceptedState(hydrateAnswerShape(answer), acceptedAnswerId));
    const documents = [
        ...local.documents.map((answer) => withAcceptedState(answer, acceptedAnswerId)),
        ...appended,
    ];

    return {
        total: Math.max(remote.total, documents.length),
        documents,
    };
}

function mergeCommentLists(
    remote: DocumentList<CommentDoc> | undefined,
    local: DocumentList<CommentDoc> | undefined
): DocumentList<CommentDoc> {
    const remoteList = remote ?? { total: 0, documents: [] };
    const localList = local ?? { total: 0, documents: [] };
    const remoteIds = new Set(remoteList.documents.map((comment) => comment.$id));
    const localOnly = localList.documents.filter((comment) => !remoteIds.has(comment.$id));
    const documents = [...localOnly, ...remoteList.documents];

    return {
        total: Math.max(remoteList.total + localOnly.length, documents.length),
        documents,
    };
}

function hydrateAnswerShape(answer: AnswerDoc): AnswerDoc {
    const totalVotes =
        typeof answer.totalVotes === "number" ? answer.totalVotes : getInitialAnswerScore(answer);

    return {
        ...answer,
        totalVotes,
        isAccepted: answer.isAccepted ?? false,
        upvotesDocuments: answer.upvotesDocuments ?? { total: 0, documents: [] },
        downvotesDocuments: answer.downvotesDocuments ?? { total: 0, documents: [] },
        comments: answer.comments ?? { total: 0, documents: [] },
    };
}

function enforceSingleAcceptedAnswer(documents: AnswerDoc[]): AnswerDoc[] {
    let acceptedSeen = false;
    return documents.map((answer) => {
        if (!answer.isAccepted) return answer;
        if (!acceptedSeen) {
            acceptedSeen = true;
            return answer;
        }
        return { ...answer, isAccepted: false };
    });
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
        totalVotes: 0,
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
        totalVotes: answer.totalVotes ?? getInitialAnswerScore(answer),
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
    id: string,
    parentId: string | null = null
): CommentDoc {
    const now = new Date().toISOString();
    return {
        $id: id,
        $createdAt: now,
        $updatedAt: now,
        content,
        type,
        typeId,
        parentId,
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
    addCommentsToState(type, typeId, [comment], setQuestionComments, setAnswers);
}

function addCommentsToState(
    type: CommentTargetType,
    typeId: string,
    comments: CommentDoc[],
    setQuestionComments: React.Dispatch<React.SetStateAction<DocumentList<CommentDoc>>>,
    setAnswers: React.Dispatch<React.SetStateAction<DocumentList<AnswerDoc>>>
) {
    if (comments.length === 0) return;

    if (type === "question") {
        setQuestionComments((prev) => ({
            total: prev.total + comments.length,
            documents: [...comments, ...prev.documents],
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
                          total: answer.comments.total + comments.length,
                          documents: [...comments, ...answer.comments.documents],
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

function removeCommentsFromState(
    type: CommentTargetType,
    typeId: string,
    commentIds: string[],
    setQuestionComments: React.Dispatch<React.SetStateAction<DocumentList<CommentDoc>>>,
    setAnswers: React.Dispatch<React.SetStateAction<DocumentList<AnswerDoc>>>
) {
    const ids = new Set(commentIds);
    if (ids.size === 0) return;

    if (type === "question") {
        setQuestionComments((prev) => ({
            total: Math.max(prev.total - ids.size, 0),
            documents: prev.documents.filter((comment) => !ids.has(comment.$id)),
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
                          total: Math.max(answer.comments.total - ids.size, 0),
                          documents: answer.comments.documents.filter(
                              (comment) => !ids.has(comment.$id)
                          ),
                      },
                  }
                : answer
        ),
    }));
}

function findCommentSubtree(
    type: CommentTargetType,
    typeId: string,
    commentId: string,
    questionComments: DocumentList<CommentDoc>,
    answers: DocumentList<AnswerDoc>
) {
    const documents =
        type === "question"
            ? questionComments.documents
            : answers.documents.find((answer) => answer.$id === typeId)?.comments.documents ??
              [];
    const ids = getCommentSubtreeIds(documents, commentId);

    return documents.filter((comment) => ids.has(comment.$id));
}

function getCommentSubtreeIds(comments: CommentDoc[], rootId: string) {
    const ids = new Set<string>();
    const childrenByParent = new Map<string, CommentDoc[]>();

    for (const comment of comments) {
        if (!comment.parentId) continue;
        const siblings = childrenByParent.get(comment.parentId) ?? [];
        siblings.push(comment);
        childrenByParent.set(comment.parentId, siblings);
    }

    const visit = (commentId: string) => {
        if (ids.has(commentId)) return;
        ids.add(commentId);
        for (const child of childrenByParent.get(commentId) ?? []) {
            visit(child.$id);
        }
    };

    if (comments.some((comment) => comment.$id === rootId)) {
        visit(rootId);
    }

    return ids;
}
