/* eslint-disable @next/next/no-img-element */
"use client";

import React from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import {
    Activity,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ArrowUp,
    BadgeCheck,
    BarChart3,
    Bookmark,
    BookOpen,
    Bot,
    Brain,
    Check,
    ChevronDown,
    ChevronUp,
    CircleCheck,
    Clock3,
    Code2,
    ExternalLink,
    Eye,
    Flame,
    Hash,
    Layers3,
    Lightbulb,
    Link2,
    ListTree,
    MessageCircle,
    MessagesSquare,
    MoreHorizontal,
    Pencil,
    Plus,
    Send,
    Share2,
    ShieldCheck,
    Sparkles,
    Star,
    Tag,
    ThumbsUp,
    Timer,
    Trash2,
    Trophy,
    UserRound,
    Users,
    Zap,
} from "lucide-react";
import { ID, Models, Query } from "appwrite";
import { databases } from "@/models/client/config";
import {
    commentCollection,
    db,
    questionCollection,
    voteCollection,
} from "@/models/name";
import { useAuthStore } from "@/store/Auth";
import { useRouter } from "next/navigation";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });
const MarkdownPreview = dynamic(
    () => import("@uiw/react-md-editor").then((module) => module.default.Markdown),
    { ssr: false }
);

interface Author {
    $id: string;
    name: string;
    reputation: number;
}

interface CommentDoc extends Models.Document {
    content: string;
    authorId: string;
    author: Author;
    $createdAt: string;
}

interface AnswerDoc extends Models.Document {
    content: string;
    authorId: string;
    author: Author;
    upvotesDocuments: Models.DocumentList<Models.Document>;
    downvotesDocuments: Models.DocumentList<Models.Document>;
    comments: Models.DocumentList<CommentDoc>;
}

interface Props {
    question: Models.Document;
    author: Models.User<{ reputation: number }>;
    answers: Models.DocumentList<AnswerDoc>;
    upvotes: Models.DocumentList<Models.Document>;
    downvotes: Models.DocumentList<Models.Document>;
    comments: Models.DocumentList<CommentDoc>;
    attachmentUrl: string;
}

type AnswerSort = "Oldest" | "Active" | "Votes";

const DEFAULT_VISIBLE_ANSWERS = 3;

export default function QuestionDetail({
    question,
    author,
    answers: initialAnswers,
    upvotes,
    downvotes,
    comments: initialComments,
    attachmentUrl,
}: Props) {
    const { user } = useAuthStore();
    const router = useRouter();

    const [answers, setAnswers] = React.useState(initialAnswers);
    const [comments, setComments] = React.useState(initialComments);
    const [answerSort, setAnswerSort] = React.useState<AnswerSort>("Votes");
    const [newAnswer, setNewAnswer] = React.useState("");
    const [isSubmittingAnswer, setIsSubmittingAnswer] = React.useState(false);
    const [answerError, setAnswerError] = React.useState("");
    const [showAnswerEditor, setShowAnswerEditor] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const [bookmarked, setBookmarked] = React.useState(false);
    const [saved, setSaved] = React.useState(false);
    const [showAiFollowUp, setShowAiFollowUp] = React.useState(false);
    const [aiFollowUp, setAiFollowUp] = React.useState("");
    const [visibleAnswerCount, setVisibleAnswerCount] = React.useState(DEFAULT_VISIBLE_ANSWERS);
    const [questionVotedDoc, setQuestionVotedDoc] = React.useState<
        Models.Document | null | undefined
    >(undefined);
    const [questionVoteResult, setQuestionVoteResult] = React.useState(
        upvotes.total - downvotes.total
    );

    const questionContent = String(question.content ?? "");
    const questionTags = ((question.tags as string[]) ?? []).filter(Boolean);
    const totalViews = Number(question.views ?? question.totalViews ?? 0);
    const totalAnswerComments = answers.documents.reduce(
        (total, answer) => total + Number(answer.comments?.total ?? 0),
        0
    );
    const totalComments = comments.total + totalAnswerComments;
    const collectiveLabel = questionTags[0]
        ? `${formatCollectiveName(questionTags[0])} Collective`
        : "ByteNest Collective";

    const aiSummary = React.useMemo(
        () => buildAiSummary(String(question.title ?? ""), questionContent, questionTags),
        [question.title, questionContent, questionTags]
    );
    const relatedConcepts = React.useMemo(
        () => buildRelatedConcepts(questionTags, String(question.title ?? "")),
        [questionTags, question.title]
    );
    const learningResources = React.useMemo(
        () => buildLearningResources(questionTags, String(question.title ?? "")),
        [questionTags, question.title]
    );

    const sortedAnswers = React.useMemo(() => {
        return [...answers.documents].sort((a, b) => {
            if (answerSort === "Oldest") {
                return new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime();
            }

            if (answerSort === "Active") {
                return new Date(b.$updatedAt).getTime() - new Date(a.$updatedAt).getTime();
            }

            return getAnswerScore(b) - getAnswerScore(a);
        });
    }, [answers.documents, answerSort]);

    const bestAnswer = React.useMemo(() => {
        return [...answers.documents].sort((a, b) => getAnswerScore(b) - getAnswerScore(a))[0] ?? null;
    }, [answers.documents]);
    const communityAnswers = React.useMemo(
        () =>
            bestAnswer
                ? sortedAnswers.filter((answer) => answer.$id !== bestAnswer.$id)
                : sortedAnswers,
        [bestAnswer, sortedAnswers]
    );
    const visibleCommunityAnswers = communityAnswers.slice(0, visibleAnswerCount);

    React.useEffect(() => {
        setVisibleAnswerCount(DEFAULT_VISIBLE_ANSWERS);
    }, [answerSort]);

    React.useEffect(() => {
        if (!user) return;

        databases
            .listDocuments(db, voteCollection, [
                Query.equal("type", "question"),
                Query.equal("typeId", question.$id),
                Query.equal("votedById", user.$id),
            ])
            .then((response) => setQuestionVotedDoc(response.documents[0] || null))
            .catch(() => setQuestionVotedDoc(null));
    }, [user, question.$id]);

    const handleQuestionVote = async (status: "upvoted" | "downvoted") => {
        if (!user) return router.push("/login");
        if (questionVotedDoc === undefined) return;

        try {
            const response = await fetch("/api/vote", {
                method: "POST",
                body: JSON.stringify({
                    votedById: user.$id,
                    voteStatus: status,
                    type: "question",
                    typeId: question.$id,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw data;
            setQuestionVoteResult(data.data.voteResult);
            setQuestionVotedDoc(data.data.document);
        } catch (error: any) {
            window.alert(error?.message || "Vote failed");
        }
    };

    const handleShareCopy = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleOpenAnswerEditor = () => {
        if (!user) {
            router.push("/login");
            return;
        }
        setShowAnswerEditor((value) => !value);
    };

    const handleSubmitAnswer = async () => {
        if (!newAnswer.trim() || !user) return;

        setIsSubmittingAnswer(true);
        setAnswerError("");

        try {
            const response = await fetch("/api/answer", {
                method: "POST",
                body: JSON.stringify({
                    questionId: question.$id,
                    answer: newAnswer,
                    authorId: user.$id,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw data;

            setNewAnswer("");
            setShowAnswerEditor(false);
            setAnswers((prev) => ({
                total: prev.total + 1,
                documents: [
                    {
                        ...data,
                        author: {
                            $id: user.$id,
                            name: user.name,
                            reputation: user.prefs?.reputation ?? 0,
                        },
                        upvotesDocuments: { documents: [], total: 0 },
                        downvotesDocuments: { documents: [], total: 0 },
                        comments: { documents: [], total: 0 },
                    } as AnswerDoc,
                    ...prev.documents,
                ],
            }));
        } catch (error: any) {
            setAnswerError(error?.message || error?.error || "Failed to post answer");
        } finally {
            setIsSubmittingAnswer(false);
        }
    };

    const handleDeleteAnswer = async (answerId: string) => {
        if (!window.confirm("Delete this answer?")) return;

        try {
            const response = await fetch("/api/answer", {
                method: "DELETE",
                body: JSON.stringify({ answerId }),
            });

            if (!response.ok) throw await response.json();
            setAnswers((prev) => ({
                total: prev.total - 1,
                documents: prev.documents.filter((answer) => answer.$id !== answerId),
            }));
        } catch (error: any) {
            window.alert(error?.message || "Failed to delete answer");
        }
    };

    const handleDeleteQuestion = async () => {
        if (!window.confirm("Delete this question permanently?")) return;

        try {
            await databases.deleteDocument(db, questionCollection, question.$id);
            router.push("/questions");
        } catch (error: any) {
            window.alert(error?.message || "Failed to delete question");
        }
    };

    return (
        <div className="relative mx-auto w-full max-w-[1420px] pb-16">
            <div className="pointer-events-none fixed inset-x-0 top-16 -z-10 h-[420px] bg-[radial-gradient(ellipse_at_top,rgba(207,232,213,0.12),transparent_62%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:64px_64px] opacity-25" />

            <Link
                href="/questions"
                className="mb-6 inline-flex items-center gap-2 text-sm text-zinc-500 transition hover:text-zinc-200"
            >
                <ArrowLeft className="size-4" />
                Questions
            </Link>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">
                <main className="min-w-0 space-y-6">
                    <QuestionHero
                        question={question}
                        author={{
                            $id: author.$id,
                            name: author.name,
                            reputation: Number(author.prefs?.reputation ?? 0),
                        }}
                        questionTags={questionTags}
                        totalViews={totalViews}
                        collectiveLabel={collectiveLabel}
                        questionVoteResult={questionVoteResult}
                        votedStatus={questionVotedDoc?.voteStatus}
                        onVote={handleQuestionVote}
                        bookmarked={bookmarked}
                        saved={saved}
                        copied={copied}
                        attachmentUrl={attachmentUrl}
                        onShare={handleShareCopy}
                        onBookmark={() => setBookmarked((value) => !value)}
                        onSave={() => setSaved((value) => !value)}
                        isOwner={user?.$id === question.authorId}
                        editHref={`/questions/${question.$id}/${slugify(question.title as string)}/edit`}
                        onDelete={handleDeleteQuestion}
                    />

                    <AISummaryCard
                        summary={aiSummary}
                        showFollowUp={showAiFollowUp}
                        followUpValue={aiFollowUp}
                        onToggleFollowUp={() => setShowAiFollowUp((value) => !value)}
                        onFollowUpChange={setAiFollowUp}
                    />

                    <AIAnswerCard summary={aiSummary} tags={questionTags} />

                    <LearningResourcesCard resources={learningResources} />

                    {bestAnswer ? (
                        <BestSolutionSection
                            answer={bestAnswer}
                            user={user}
                            onDelete={handleDeleteAnswer}
                        />
                    ) : (
                        <NoBestSolution onAsk={handleOpenAnswerEditor} loggedIn={Boolean(user)} />
                    )}

                    <CommunityAnswersSection
                        answers={visibleCommunityAnswers}
                        totalAnswers={communityAnswers.length}
                        remainingCount={Math.max(communityAnswers.length - visibleAnswerCount, 0)}
                        answerSort={answerSort}
                        onSortChange={setAnswerSort}
                        onShowMore={() =>
                            setVisibleAnswerCount((count) => count + DEFAULT_VISIBLE_ANSWERS)
                        }
                        onOpenEditor={handleOpenAnswerEditor}
                        showAnswerEditor={showAnswerEditor}
                        newAnswer={newAnswer}
                        onNewAnswerChange={setNewAnswer}
                        isSubmittingAnswer={isSubmittingAnswer}
                        answerError={answerError}
                        onSubmitAnswer={handleSubmitAnswer}
                        onCancelAnswer={() => setShowAnswerEditor(false)}
                        user={user}
                        onDeleteAnswer={handleDeleteAnswer}
                    />

                    <section
                        id="discussion"
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl"
                    >
                        <SectionHeader
                            eyebrow="Discussion"
                            title="Question discussion"
                            description={`${comments.total} comment${comments.total === 1 ? "" : "s"} on the original question`}
                            icon={<MessagesSquare className="size-4" />}
                        />
                        <CommentsSection
                            comments={comments}
                            setComments={setComments}
                            type="question"
                            typeId={question.$id}
                            user={user}
                            className="mt-5"
                        />
                    </section>
                </main>

                <QuestionSidebar
                    aiSummary={aiSummary}
                    relatedConcepts={relatedConcepts}
                    questionTags={questionTags}
                    similarQuestions={buildSimilarQuestions(questionTags, String(question.title ?? ""))}
                    activity={{
                        answers: answers.total,
                        comments: totalComments,
                        views: totalViews,
                    }}
                    stats={{
                        votes: questionVoteResult,
                        answers: answers.total,
                        views: totalViews,
                        comments: totalComments,
                    }}
                    author={{
                        $id: author.$id,
                        name: author.name,
                        reputation: Number(author.prefs?.reputation ?? 0),
                    }}
                    createdAt={question.$createdAt}
                />
            </div>
        </div>
    );
}

function QuestionHero({
    question,
    author,
    questionTags,
    totalViews,
    collectiveLabel,
    questionVoteResult,
    votedStatus,
    onVote,
    bookmarked,
    saved,
    copied,
    attachmentUrl,
    onShare,
    onBookmark,
    onSave,
    isOwner,
    editHref,
    onDelete,
}: {
    question: Models.Document;
    author: Author;
    questionTags: string[];
    totalViews: number;
    collectiveLabel: string;
    questionVoteResult: number;
    votedStatus?: unknown;
    onVote: (status: "upvoted" | "downvoted") => void;
    bookmarked: boolean;
    saved: boolean;
    copied: boolean;
    attachmentUrl: string;
    onShare: () => void;
    onBookmark: () => void;
    onSave: () => void;
    isOwner: boolean;
    editHref: string;
    onDelete: () => void;
}) {
    return (
        <article
            id="question"
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] shadow-2xl shadow-black/30 backdrop-blur-xl"
        >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#CFE8D5]/70 to-transparent" />
            <div className="pointer-events-none absolute right-0 top-0 h-48 w-2/3 bg-[radial-gradient(ellipse_at_top_right,rgba(207,232,213,0.12),transparent_55%)]" />

            <header className="relative p-5 sm:p-7">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 px-3 py-1 text-xs font-medium text-[#CFE8D5]">
                        <Sparkles className="size-3.5" />
                        AI indexed
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-zinc-400">
                        <Layers3 className="size-3.5" />
                        {collectiveLabel}
                    </span>
                </div>

                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                        <h1 className="max-w-4xl text-3xl font-semibold leading-tight tracking-normal text-zinc-50 sm:text-4xl">
                            {question.title}
                        </h1>
                        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-500">
                            <MetaItem
                                icon={<UserRound className="size-3.5" />}
                                label={author.name}
                            />
                            <MetaItem
                                icon={<Clock3 className="size-3.5" />}
                                label={`Asked ${convertDateToRelativeTime(new Date(question.$createdAt))}`}
                            />
                            <MetaItem
                                icon={<Timer className="size-3.5" />}
                                label={`Updated ${convertDateToRelativeTime(new Date(question.$updatedAt))}`}
                            />
                            <MetaItem
                                icon={<Eye className="size-3.5" />}
                                label={`${formatCount(totalViews)} views`}
                            />
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <IconButton
                            label="Share question"
                            active={copied}
                            onClick={onShare}
                            icon={copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
                        />
                        <IconButton
                            label="Save question"
                            active={saved}
                            onClick={onSave}
                            icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} />}
                        />
                        <IconButton
                            label="Follow question"
                            active={bookmarked}
                            onClick={onBookmark}
                            icon={<Star className="size-4" fill={bookmarked ? "currentColor" : "none"} />}
                        />
                    </div>
                </div>

                {questionTags.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                        {questionTags.map((tag) => (
                            <TagPill key={tag} tag={tag} />
                        ))}
                    </div>
                )}
            </header>

            <div className="grid gap-5 border-t border-white/10 p-4 sm:p-6 lg:grid-cols-[64px_minmax(0,1fr)]">
                <VoteRail
                    voteResult={questionVoteResult}
                    votedStatus={votedStatus}
                    onVote={onVote}
                    bookmarked={bookmarked}
                    onBookmark={onBookmark}
                />

                <div className="min-w-0">
                    <StickyActionBar
                        copied={copied}
                        saved={saved}
                        bookmarked={bookmarked}
                        isOwner={isOwner}
                        onShare={onShare}
                        onSave={onSave}
                        onBookmark={onBookmark}
                        editHref={editHref}
                        onDelete={onDelete}
                    />

                    <div className="question-detail-markdown mt-5" data-color-mode="dark">
                        <MarkdownPreview source={String(question.content ?? "")} />
                    </div>

                    {attachmentUrl && (
                        <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-black/30 p-3">
                            <img
                                src={attachmentUrl}
                                alt="Question attachment"
                                className="max-h-[420px] w-full rounded-lg object-contain"
                            />
                        </div>
                    )}

                    <div className="mt-7 flex flex-col gap-4 border-t border-white/10 pt-5 lg:flex-row lg:items-center lg:justify-between">
                        <p className="max-w-xl text-sm leading-relaxed text-zinc-500">
                            ByteNest ranks responses by clarity, reproducibility, and community
                            confirmation so the strongest path stays easy to find.
                        </p>
                        <AuthorSignature
                            label={`asked ${convertDateToRelativeTime(new Date(question.$createdAt))}`}
                            author={author}
                        />
                    </div>
                </div>
            </div>
        </article>
    );
}

function AISummaryCard({
    summary,
    showFollowUp,
    followUpValue,
    onToggleFollowUp,
    onFollowUpChange,
}: {
    summary: AISummary;
    showFollowUp: boolean;
    followUpValue: string;
    onToggleFollowUp: () => void;
    onFollowUpChange: (value: string) => void;
}) {
    return (
        <section
            id="ai-summary"
            className="relative overflow-hidden rounded-2xl border border-[#CFE8D5]/20 bg-[linear-gradient(135deg,rgba(207,232,213,0.12),rgba(255,255,255,0.035)_42%,rgba(255,255,255,0.02))] p-5 shadow-2xl shadow-black/25 backdrop-blur-xl sm:p-6"
        >
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#CFE8D5]/80 to-transparent" />
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                    <div className="mb-3 flex items-center gap-2">
                        <span className="flex size-9 items-center justify-center rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 text-[#CFE8D5]">
                            <Brain className="size-4" />
                        </span>
                        <div>
                            <p className="text-xs font-medium uppercase tracking-[0.24em] text-[#CFE8D5]/70">
                                AI Summary
                            </p>
                            <h2 className="text-xl font-semibold text-zinc-50">Likely solution path</h2>
                        </div>
                    </div>
                    <p className="max-w-3xl text-sm leading-7 text-zinc-300">{summary.overview}</p>
                </div>

                <button
                    type="button"
                    onClick={onToggleFollowUp}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#07100B] transition hover:-translate-y-0.5 hover:bg-[#ddf3e2]"
                >
                    <Sparkles className="size-4" />
                    Ask AI Follow-up
                </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {summary.checks.map((check) => (
                    <div
                        key={check}
                        className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-300"
                    >
                        <CircleCheck className="mb-3 size-4 text-[#CFE8D5]" />
                        {check}
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {showFollowUp && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="mt-5 rounded-xl border border-white/10 bg-black/25 p-3"
                    >
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                value={followUpValue}
                                onChange={(event) => onFollowUpChange(event.target.value)}
                                placeholder="Ask about edge cases, errors, or implementation tradeoffs..."
                                className="min-h-11 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#CFE8D5]/45"
                            />
                            <button
                                type="button"
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-zinc-200 transition hover:border-[#CFE8D5]/30 hover:text-[#CFE8D5]"
                            >
                                <Send className="size-4" />
                                Queue
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}

function AIAnswerCard({ summary, tags }: { summary: AISummary; tags: string[] }) {
    return (
        <section
            id="ai-answer"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6"
        >
            <SectionHeader
                eyebrow="AI Answer"
                title="Synthesized first pass"
                description="Generated from the question context and community patterns"
                icon={<Bot className="size-4" />}
                badge="Beta"
            />

            <div className="mt-5 space-y-4 text-sm leading-7 text-zinc-300">
                <p>{summary.answer}</p>
                <div className="rounded-xl border border-white/10 bg-black/25 p-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                        <Code2 className="size-3.5" />
                        Suggested debug path
                    </div>
                    <pre className="overflow-x-auto rounded-lg border border-white/10 bg-[#070807] p-4 text-[13px] leading-6 text-[#CFE8D5]">
                        <code>{summary.codeHint}</code>
                    </pre>
                </div>
                <div className="flex flex-wrap gap-2">
                    {(tags.length ? tags : ["debugging", "architecture", "patterns"]).slice(0, 4).map((tag) => (
                        <span
                            key={tag}
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-zinc-400"
                        >
                            <Hash className="size-3" />
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}

function LearningResourcesCard({ resources }: { resources: LearningResource[] }) {
    return (
        <section
            id="resources"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6"
        >
            <SectionHeader
                eyebrow="Learning Path"
                title="Related resources"
                description="Concepts worth reviewing while solving this"
                icon={<BookOpen className="size-4" />}
            />
            <div className="mt-5 grid gap-3 md:grid-cols-3">
                {resources.map((resource) => (
                    <Link
                        key={resource.title}
                        href={resource.href}
                        className="group rounded-xl border border-white/10 bg-black/20 p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#CFE8D5]/25 hover:bg-[#CFE8D5]/[0.055]"
                    >
                        <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#CFE8D5]">
                            {resource.icon}
                        </div>
                        <p className="font-medium text-zinc-100">{resource.title}</p>
                        <p className="mt-2 text-sm leading-6 text-zinc-500">{resource.description}</p>
                        <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#CFE8D5] opacity-80 transition group-hover:opacity-100">
                            Open resource
                            <ArrowRight className="size-3" />
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    );
}

function BestSolutionSection({
    answer,
    user,
    onDelete,
}: {
    answer: AnswerDoc;
    user: Models.User<any> | null;
    onDelete: (id: string) => void;
}) {
    return (
        <section id="best-solution" className="space-y-4">
            <div className="rounded-2xl border border-[#CFE8D5]/25 bg-[linear-gradient(135deg,rgba(207,232,213,0.12),rgba(255,255,255,0.03)_50%,rgba(0,0,0,0.2))] p-4 shadow-2xl shadow-black/25 backdrop-blur-xl sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <SectionHeader
                        eyebrow="Best Solution"
                        title="Community accepted path"
                        description="Highlighted separately from normal answers"
                        icon={<Trophy className="size-4" />}
                        compact
                    />
                    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#CFE8D5]/25 bg-[#CFE8D5]/10 px-3 py-1 text-xs font-semibold text-[#CFE8D5]">
                        <BadgeCheck className="size-3.5" />
                        Accepted Answer
                    </span>
                </div>
                <AnswerCard answer={answer} user={user} onDelete={onDelete} variant="best" />
            </div>
        </section>
    );
}

function CommunityAnswersSection({
    answers,
    totalAnswers,
    remainingCount,
    answerSort,
    onSortChange,
    onShowMore,
    onOpenEditor,
    showAnswerEditor,
    newAnswer,
    onNewAnswerChange,
    isSubmittingAnswer,
    answerError,
    onSubmitAnswer,
    onCancelAnswer,
    user,
    onDeleteAnswer,
}: {
    answers: AnswerDoc[];
    totalAnswers: number;
    remainingCount: number;
    answerSort: AnswerSort;
    onSortChange: (sort: AnswerSort) => void;
    onShowMore: () => void;
    onOpenEditor: () => void;
    showAnswerEditor: boolean;
    newAnswer: string;
    onNewAnswerChange: (value: string) => void;
    isSubmittingAnswer: boolean;
    answerError: string;
    onSubmitAnswer: () => void;
    onCancelAnswer: () => void;
    user: Models.User<any> | null;
    onDeleteAnswer: (id: string) => void;
}) {
    return (
        <section
            id="community-answers"
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-6"
        >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <SectionHeader
                    eyebrow="Community Answers"
                    title={`${totalAnswers} answer${totalAnswers === 1 ? "" : "s"}`}
                    description="Peer-tested solutions and implementation notes"
                    icon={<Users className="size-4" />}
                />

                <div className="flex flex-wrap items-center gap-3">
                    {totalAnswers > 1 && (
                        <div className="inline-flex rounded-xl border border-white/10 bg-black/25 p-1">
                            {(["Oldest", "Votes", "Active"] as AnswerSort[]).map((sort) => (
                                <button
                                    key={sort}
                                    type="button"
                                    onClick={() => onSortChange(sort)}
                                    className={cn(
                                        "h-9 rounded-lg px-3 text-sm font-medium transition",
                                        answerSort === sort
                                            ? "bg-[#CFE8D5] text-[#07100B]"
                                            : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-100"
                                    )}
                                >
                                    {sort === "Votes" ? "Most Voted" : sort}
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={onOpenEditor}
                        className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition hover:-translate-y-0.5 hover:bg-[#ddf3e2]"
                    >
                        <Plus className="size-4" />
                        Answer
                    </button>
                </div>
            </div>

            <AnimatePresence>
                {showAnswerEditor && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-xl"
                    >
                        <h3 className="mb-4 text-sm font-semibold text-zinc-300">
                            Share a community answer
                        </h3>
                        <div data-color-mode="dark">
                            <MDEditor
                                value={newAnswer}
                                onChange={(value) => onNewAnswerChange(value || "")}
                                height={300}
                                preview="live"
                                textareaProps={{
                                    placeholder: "Share a clear solution, explanation, or example.",
                                }}
                                style={{
                                    background: "rgba(255,255,255,0.02)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "12px",
                                    overflow: "hidden",
                                }}
                            />
                        </div>
                        {answerError && <p className="mt-3 text-sm text-red-400">{answerError}</p>}
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <Button
                                type="button"
                                onClick={onSubmitAnswer}
                                disabled={isSubmittingAnswer || !newAnswer.trim()}
                                className="h-10 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-5 text-sm font-semibold text-[#08100B] shadow-none transition hover:bg-[#ddf3e2] disabled:opacity-50"
                            >
                                {isSubmittingAnswer ? "Posting..." : "Post Answer"}
                                {!isSubmittingAnswer && <Send className="size-4" />}
                            </Button>
                            <button
                                type="button"
                                onClick={onCancelAnswer}
                                className="h-10 rounded-xl border border-white/10 px-4 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="mt-5 space-y-4">
                {answers.length === 0 ? (
                    <EmptyAnswers onAsk={onOpenEditor} loggedIn={Boolean(user)} />
                ) : (
                    answers.map((answer) => (
                        <AnswerCard
                            key={answer.$id}
                            answer={answer}
                            user={user}
                            onDelete={onDeleteAnswer}
                        />
                    ))
                )}
            </div>

            {remainingCount > 0 && (
                <button
                    type="button"
                    onClick={onShowMore}
                    className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/25 text-sm font-semibold text-zinc-300 transition hover:border-[#CFE8D5]/25 hover:bg-[#CFE8D5]/[0.06] hover:text-[#CFE8D5]"
                >
                    Show More Answers
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-zinc-500">
                        {remainingCount}
                    </span>
                    <ChevronDown className="size-4" />
                </button>
            )}

            {!user && (
                <div className="mt-6 rounded-xl border border-[#CFE8D5]/15 bg-[#CFE8D5]/[0.04] p-5 text-center">
                    <p className="text-sm text-zinc-400">
                        Know the answer?{" "}
                        <Link href="/login" className="font-medium text-[#CFE8D5] hover:text-white">
                            Log in
                        </Link>{" "}
                        or{" "}
                        <Link href="/register" className="font-medium text-[#CFE8D5] hover:text-white">
                            sign up
                        </Link>{" "}
                        to share it.
                    </p>
                </div>
            )}
        </section>
    );
}

function QuestionSidebar({
    aiSummary,
    relatedConcepts,
    questionTags,
    similarQuestions,
    activity,
    stats,
    author,
    createdAt,
}: {
    aiSummary: AISummary;
    relatedConcepts: RelatedConcept[];
    questionTags: string[];
    similarQuestions: SimilarQuestion[];
    activity: { answers: number; comments: number; views: number };
    stats: { votes: number; answers: number; views: number; comments: number };
    author: Author;
    createdAt: string;
}) {
    return (
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
            <SidebarCard>
                <SidebarTitle icon={<Sparkles className="size-4" />} title="AI Summary" badge="Beta" />
                <p className="mt-4 text-sm leading-6 text-zinc-400">{aiSummary.short}</p>
                <ul className="mt-4 space-y-2">
                    {aiSummary.sidebarBullets.map((bullet) => (
                        <li key={bullet} className="flex gap-2 text-sm leading-6 text-zinc-400">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#CFE8D5]" />
                            {bullet}
                        </li>
                    ))}
                </ul>
                <button
                    type="button"
                    className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm font-medium text-zinc-200 transition hover:border-[#CFE8D5]/25 hover:text-[#CFE8D5]"
                >
                    <Bot className="size-4" />
                    Ask AI follow-up
                </button>
            </SidebarCard>

            <SidebarCard>
                <SidebarTitle icon={<ListTree className="size-4" />} title="On This Page" />
                <nav className="mt-4 space-y-1">
                    {[
                        ["Question", "#question"],
                        ["AI Summary", "#ai-summary"],
                        ["AI Answer", "#ai-answer"],
                        ["Resources", "#resources"],
                        ["Best Solution", "#best-solution"],
                        ["Community Answers", "#community-answers"],
                        ["Discussion", "#discussion"],
                    ].map(([label, href]) => (
                        <a
                            key={href}
                            href={href}
                            className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-100"
                        >
                            {label}
                            <ArrowRight className="size-3" />
                        </a>
                    ))}
                </nav>
            </SidebarCard>

            <SidebarCard>
                <SidebarTitle icon={<Lightbulb className="size-4" />} title="Related Concepts" />
                <div className="mt-4 space-y-2">
                    {relatedConcepts.map((concept) => (
                        <Link
                            key={concept.title}
                            href={concept.href}
                            className="group flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 transition hover:border-[#CFE8D5]/25 hover:bg-[#CFE8D5]/[0.055]"
                        >
                            <span className="flex size-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-[#CFE8D5]">
                                {concept.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-zinc-100">
                                    {concept.title}
                                </span>
                                <span className="text-xs text-zinc-500">{concept.source}</span>
                            </span>
                            <ExternalLink className="size-3.5 text-zinc-600 transition group-hover:text-[#CFE8D5]" />
                        </Link>
                    ))}
                </div>
            </SidebarCard>

            <SidebarCard>
                <SidebarTitle icon={<Link2 className="size-4" />} title="Similar Questions" />
                <div className="mt-4 space-y-4">
                    {similarQuestions.map((item) => (
                        <Link key={item.title} href={item.href} className="group block">
                            <p className="text-sm font-medium leading-5 text-[#CFE8D5] transition group-hover:text-white">
                                {item.title}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">{item.answers} answers</p>
                        </Link>
                    ))}
                </div>
            </SidebarCard>

            <SidebarCard>
                <SidebarTitle icon={<Activity className="size-4" />} title="Community Activity" />
                <div className="mt-4 divide-y divide-white/10">
                    <ActivityRow value={activity.answers} label="Answers added" time="today" />
                    <ActivityRow value={activity.comments} label="Comments added" time="recent" />
                    <ActivityRow value={activity.views} label="People viewed" time="lifetime" />
                </div>
                <div className="mt-4 flex items-center">
                    {["AL", "JS", "TS", "RX", "AI"].map((initials, index) => (
                        <span
                            key={initials}
                            className="-ml-2 first:ml-0 flex size-8 items-center justify-center rounded-full border border-black bg-[#CFE8D5] text-[10px] font-bold text-[#07100B]"
                            style={{ zIndex: 10 - index }}
                        >
                            {initials}
                        </span>
                    ))}
                    <span className="-ml-2 flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs text-[#CFE8D5]">
                        +8
                    </span>
                </div>
            </SidebarCard>

            <SidebarCard>
                <SidebarTitle icon={<BarChart3 className="size-4" />} title="Question Stats" />
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <StatTile label="Votes" value={formatCount(stats.votes)} />
                    <StatTile label="Answers" value={formatCount(stats.answers)} />
                    <StatTile label="Views" value={formatCount(stats.views)} />
                    <StatTile label="Comments" value={formatCount(stats.comments)} />
                </div>
            </SidebarCard>

            <SidebarAuthorCard author={author} createdAt={createdAt} />

            <SidebarCard>
                <SidebarTitle icon={<Flame className="size-4" />} title="Trending Tags" />
                <div className="mt-4 flex flex-wrap gap-2">
                    {buildTrendingTags(questionTags).map((tag) => (
                        <TagPill key={tag} tag={tag} compact />
                    ))}
                </div>
            </SidebarCard>
        </aside>
    );
}

function AnswerCard({
    answer,
    user,
    onDelete,
    variant = "default",
}: {
    answer: AnswerDoc;
    user: Models.User<any> | null;
    onDelete: (id: string) => void;
    variant?: "default" | "best";
}) {
    const router = useRouter();
    const [votedDoc, setVotedDoc] = React.useState<Models.Document | null | undefined>(undefined);
    const [voteResult, setVoteResult] = React.useState(getAnswerScore(answer));
    const [comments, setComments] = React.useState(answer.comments);
    const [workedForMe, setWorkedForMe] = React.useState(false);

    React.useEffect(() => {
        if (!user) return;

        databases
            .listDocuments(db, voteCollection, [
                Query.equal("type", "answer"),
                Query.equal("typeId", answer.$id),
                Query.equal("votedById", user.$id),
            ])
            .then((response) => setVotedDoc(response.documents[0] || null))
            .catch(() => setVotedDoc(null));
    }, [user, answer.$id]);

    const handleVote = async (status: "upvoted" | "downvoted") => {
        if (!user) return router.push("/login");
        if (votedDoc === undefined) return;

        try {
            const response = await fetch("/api/vote", {
                method: "POST",
                body: JSON.stringify({
                    votedById: user.$id,
                    voteStatus: status,
                    type: "answer",
                    typeId: answer.$id,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw data;
            setVoteResult(data.data.voteResult);
            setVotedDoc(data.data.document);
        } catch (error: any) {
            window.alert(error?.message || "Vote failed");
        }
    };

    return (
        <motion.article
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
                "grid gap-4 rounded-2xl border bg-black/20 p-4 backdrop-blur-xl transition duration-200 hover:-translate-y-0.5 hover:bg-white/[0.035] sm:p-5 lg:grid-cols-[52px_minmax(0,1fr)]",
                variant === "best"
                    ? "border-[#CFE8D5]/25 shadow-[0_18px_70px_rgba(207,232,213,0.08)]"
                    : "border-white/10 hover:border-white/15"
            )}
        >
            <aside className="flex items-center gap-2 lg:flex-col">
                <VoteButton
                    label="Upvote answer"
                    active={votedDoc?.voteStatus === "upvoted"}
                    onClick={() => handleVote("upvoted")}
                >
                    <ArrowUp className="size-4" />
                </VoteButton>
                <div className="min-w-9 text-center text-lg font-semibold text-zinc-100">
                    {voteResult}
                </div>
                <VoteButton
                    label="Downvote answer"
                    active={votedDoc?.voteStatus === "downvoted"}
                    danger
                    onClick={() => handleVote("downvoted")}
                >
                    <ArrowDown className="size-4" />
                </VoteButton>
                {variant === "best" && (
                    <span className="hidden size-8 items-center justify-center rounded-full border border-[#CFE8D5]/25 bg-[#CFE8D5]/10 text-[#CFE8D5] lg:flex">
                        <Check className="size-4" />
                    </span>
                )}
            </aside>

            <div className="min-w-0">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Avatar name={answer.author.name} />
                        <div>
                            <Link
                                href={`/users/${answer.author.$id}/${slugify(answer.author.name)}`}
                                className="text-sm font-semibold text-zinc-100 transition hover:text-[#CFE8D5]"
                            >
                                {answer.author.name}
                            </Link>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                <span>{formatCount(answer.author.reputation)} rep</span>
                                <span className="size-1 rounded-full bg-zinc-700" />
                                <span>{convertDateToRelativeTime(new Date(answer.$createdAt))}</span>
                            </div>
                        </div>
                    </div>
                    <QualityBadges author={answer.author} best={variant === "best"} />
                </div>

                <div className="question-detail-markdown" data-color-mode="dark">
                    <MarkdownPreview source={answer.content} />
                </div>

                <div className="mt-6 flex flex-col gap-4 border-t border-white/10 pt-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                        <button
                            type="button"
                            onClick={() => setWorkedForMe((value) => !value)}
                            className={cn(
                                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 transition",
                                workedForMe
                                    ? "border-[#CFE8D5]/30 bg-[#CFE8D5]/10 text-[#CFE8D5]"
                                    : "border-white/10 bg-white/[0.03] hover:border-[#CFE8D5]/25 hover:text-[#CFE8D5]"
                            )}
                        >
                            <ThumbsUp className="size-4" />
                            Worked for Me
                            <span className="text-xs text-zinc-500">{Math.max(voteResult, 0) + 12}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(window.location.href)}
                            className="inline-flex items-center gap-2 transition hover:text-zinc-200"
                        >
                            <Share2 className="size-4" />
                            Share
                        </button>
                        {user?.$id === answer.authorId && (
                            <button
                                type="button"
                                onClick={() => onDelete(answer.$id)}
                                className="inline-flex items-center gap-2 text-red-400/70 transition hover:text-red-300"
                            >
                                <Trash2 className="size-4" />
                                Delete
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        className="inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-zinc-500 transition hover:border-white/20 hover:text-zinc-200"
                    >
                        <MoreHorizontal className="size-4" />
                        More
                    </button>
                </div>

                <CommentsSection
                    comments={comments}
                    setComments={setComments}
                    type="answer"
                    typeId={answer.$id}
                    user={user}
                    className="mt-5"
                />
            </div>
        </motion.article>
    );
}

function CommentsSection({
    comments,
    setComments,
    type,
    typeId,
    user,
    className,
}: {
    comments: Models.DocumentList<CommentDoc>;
    setComments: React.Dispatch<React.SetStateAction<Models.DocumentList<CommentDoc>>>;
    type: "question" | "answer";
    typeId: string;
    user: Models.User<any> | null;
    className?: string;
}) {
    const [expanded, setExpanded] = React.useState(false);
    const [showInput, setShowInput] = React.useState(false);
    const [newComment, setNewComment] = React.useState("");
    const [isPosting, setIsPosting] = React.useState(false);
    const router = useRouter();

    const handlePost = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!newComment.trim() || !user) return;

        setIsPosting(true);

        try {
            const document = await databases.createDocument(db, commentCollection, ID.unique(), {
                content: newComment.trim(),
                authorId: user.$id,
                type,
                typeId,
            });

            setComments((prev) => ({
                total: prev.total + 1,
                documents: [
                    {
                        ...document,
                        author: {
                            $id: user.$id,
                            name: user.name,
                            reputation: user.prefs?.reputation ?? 0,
                        },
                    } as CommentDoc,
                    ...prev.documents,
                ],
            }));
            setNewComment("");
            setShowInput(false);
            setExpanded(true);
        } catch (error: any) {
            window.alert(error?.message || "Failed to post comment");
        } finally {
            setIsPosting(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        try {
            await databases.deleteDocument(db, commentCollection, commentId);
            setComments((prev) => ({
                total: prev.total - 1,
                documents: prev.documents.filter((comment) => comment.$id !== commentId),
            }));
        } catch (error: any) {
            window.alert(error?.message || "Failed to delete comment");
        }
    };

    const visibleComments = expanded ? comments.documents : comments.documents.slice(0, 2);

    return (
        <div className={cn("rounded-xl border border-white/10 bg-black/20 p-4", className)}>
            {visibleComments.length > 0 ? (
                visibleComments.map((comment) => (
                    <div
                        key={comment.$id}
                        className="group flex items-start gap-3 border-b border-white/[0.06] py-3 first:pt-0 last:border-0 last:pb-0"
                    >
                        <Avatar name={comment.author?.name || "User"} small />
                        <p className="flex-1 text-sm leading-relaxed text-zinc-400">
                            {comment.content}{" "}
                            <Link
                                href={`/users/${comment.authorId}/${slugify(comment.author?.name || "user")}`}
                                className="font-medium text-[#CFE8D5] hover:text-white"
                            >
                                {comment.author?.name}
                            </Link>{" "}
                            <span className="text-zinc-600">
                                {convertDateToRelativeTime(new Date(comment.$createdAt))}
                            </span>
                        </p>
                        {user?.$id === comment.authorId && (
                            <button
                                type="button"
                                onClick={() => handleDelete(comment.$id)}
                                className="shrink-0 text-zinc-700 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                                aria-label="Delete comment"
                            >
                                <Trash2 className="size-4" />
                            </button>
                        )}
                    </div>
                ))
            ) : (
                <p className="text-sm text-zinc-600">No discussion yet.</p>
            )}

            {comments.total > 2 && (
                <button
                    type="button"
                    onClick={() => setExpanded((value) => !value)}
                    className="mt-3 inline-flex items-center gap-1 text-xs text-zinc-600 transition hover:text-zinc-300"
                >
                    {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    {expanded
                        ? "Show less"
                        : `Show ${comments.total - 2} more comment${comments.total - 2 === 1 ? "" : "s"}`}
                </button>
            )}

            {showInput ? (
                <form onSubmit={handlePost} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                        autoFocus
                        value={newComment}
                        onChange={(event) => setNewComment(event.target.value)}
                        placeholder="Add a comment..."
                        className="min-h-10 flex-1 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#CFE8D5]/40"
                        maxLength={500}
                    />
                    <button
                        type="submit"
                        disabled={isPosting || !newComment.trim()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2] disabled:opacity-50"
                    >
                        <Send className="size-4" />
                        Post
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowInput(false)}
                        className="h-10 rounded-xl border border-white/10 px-4 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200"
                    >
                        Cancel
                    </button>
                </form>
            ) : (
                <button
                    type="button"
                    onClick={() => {
                        if (!user) {
                            router.push("/login");
                            return;
                        }
                        setShowInput(true);
                    }}
                    className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-600 transition hover:text-zinc-300"
                >
                    <MessageCircle className="size-4" />
                    Add comment
                </button>
            )}
        </div>
    );
}

function VoteRail({
    voteResult,
    votedStatus,
    onVote,
    bookmarked,
    onBookmark,
}: {
    voteResult: number;
    votedStatus?: unknown;
    onVote: (status: "upvoted" | "downvoted") => void;
    bookmarked: boolean;
    onBookmark: () => void;
}) {
    return (
        <aside className="flex items-center gap-3 lg:sticky lg:top-28 lg:flex-col lg:self-start">
            <VoteButton
                label="Upvote"
                active={votedStatus === "upvoted"}
                onClick={() => onVote("upvoted")}
            >
                <ArrowUp className="size-5" />
            </VoteButton>
            <div className="min-w-10 text-center text-2xl font-semibold text-[#CFE8D5] lg:min-w-0">
                {voteResult}
            </div>
            <VoteButton
                label="Downvote"
                active={votedStatus === "downvoted"}
                danger
                onClick={() => onVote("downvoted")}
            >
                <ArrowDown className="size-5" />
            </VoteButton>
            <button
                type="button"
                onClick={onBookmark}
                aria-label="Bookmark"
                className={cn(
                    "flex size-11 items-center justify-center rounded-xl border transition",
                    bookmarked
                        ? "border-[#CFE8D5]/40 bg-[#CFE8D5]/15 text-[#CFE8D5]"
                        : "border-white/10 bg-white/[0.035] text-zinc-500 hover:border-white/20 hover:text-zinc-100"
                )}
            >
                <Bookmark className="size-4" fill={bookmarked ? "currentColor" : "none"} />
            </button>
        </aside>
    );
}

function VoteButton({
    active,
    danger,
    label,
    onClick,
    children,
}: {
    active: boolean;
    danger?: boolean;
    label: string;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className={cn(
                "flex size-12 items-center justify-center rounded-xl border transition duration-200 hover:-translate-y-0.5",
                active && !danger && "border-[#CFE8D5]/45 bg-[#CFE8D5]/15 text-[#CFE8D5]",
                active && danger && "border-red-400/40 bg-red-400/10 text-red-300",
                !active &&
                    "border-white/10 bg-white/[0.035] text-zinc-400 hover:border-[#CFE8D5]/35 hover:text-[#CFE8D5]",
                !active && danger && "hover:border-red-400/35 hover:text-red-300"
            )}
        >
            {children}
        </button>
    );
}

function StickyActionBar({
    copied,
    saved,
    bookmarked,
    isOwner,
    onShare,
    onSave,
    onBookmark,
    editHref,
    onDelete,
}: {
    copied: boolean;
    saved: boolean;
    bookmarked: boolean;
    isOwner: boolean;
    onShare: () => void;
    onSave: () => void;
    onBookmark: () => void;
    editHref: string;
    onDelete: () => void;
}) {
    return (
        <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#080908]/85 p-2 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2">
                <ActionButton onClick={onShare} active={copied} icon={copied ? <Check /> : <Share2 />}>
                    {copied ? "Copied" : "Share"}
                </ActionButton>
                <ActionButton onClick={onSave} active={saved} icon={<Bookmark />}>
                    {saved ? "Saved" : "Save"}
                </ActionButton>
                <ActionButton onClick={onBookmark} active={bookmarked} icon={<Star />}>
                    {bookmarked ? "Following" : "Follow"}
                </ActionButton>
            </div>

            {isOwner && (
                <div className="flex items-center gap-2">
                    <Link
                        href={editHref}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 px-3 text-sm text-zinc-400 transition hover:border-white/20 hover:text-zinc-100"
                    >
                        <Pencil className="size-4" />
                        Edit
                    </Link>
                    <button
                        type="button"
                        onClick={onDelete}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-400/15 px-3 text-sm text-red-400/75 transition hover:border-red-400/30 hover:text-red-300"
                    >
                        <Trash2 className="size-4" />
                        Delete
                    </button>
                </div>
            )}
        </div>
    );
}

function ActionButton({
    onClick,
    active,
    icon,
    children,
}: {
    onClick: () => void;
    active?: boolean;
    icon: React.ReactElement;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition",
                active
                    ? "border-[#CFE8D5]/30 bg-[#CFE8D5]/10 text-[#CFE8D5]"
                    : "border-white/10 text-zinc-400 hover:border-white/20 hover:bg-white/[0.04] hover:text-zinc-100"
            )}
        >
            {React.cloneElement(icon, { className: "size-4" })}
            {children}
        </button>
    );
}

function NoBestSolution({ onAsk, loggedIn }: { onAsk: () => void; loggedIn: boolean }) {
    const router = useRouter();

    return (
        <section
            id="best-solution"
            className="rounded-2xl border border-[#CFE8D5]/15 bg-[#CFE8D5]/[0.035] p-6 text-center shadow-2xl shadow-black/20 backdrop-blur-xl"
        >
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 text-[#CFE8D5]">
                <Trophy className="size-6" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-100">No best solution yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-500">
                A standout answer will be highlighted here once the community adds a solution.
            </p>
            <button
                type="button"
                onClick={() => (loggedIn ? onAsk() : router.push("/login"))}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2]"
            >
                <Plus className="size-4" />
                Write an answer
            </button>
        </section>
    );
}

function EmptyAnswers({ onAsk, loggedIn }: { onAsk: () => void; loggedIn: boolean }) {
    const router = useRouter();

    return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-black/20 px-6 py-14 text-center">
            <div className="mb-5 w-full max-w-sm space-y-3">
                <div className="h-3 rounded-full bg-white/[0.08]" />
                <div className="mx-auto h-3 w-4/5 rounded-full bg-white/[0.05]" />
                <div className="mx-auto h-3 w-3/5 rounded-full bg-white/[0.035]" />
            </div>
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                <MessageCircle className="size-6 text-zinc-500" />
            </div>
            <p className="text-base font-semibold text-zinc-200">No community answers yet</p>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">
                Be the first to add a tested fix or deeper explanation.
            </p>
            <button
                type="button"
                onClick={() => (loggedIn ? onAsk() : router.push("/login"))}
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2]"
            >
                <Plus className="size-4" />
                Write an answer
            </button>
        </div>
    );
}

function SectionHeader({
    eyebrow,
    title,
    description,
    icon,
    badge,
    compact,
}: {
    eyebrow: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    badge?: string;
    compact?: boolean;
}) {
    return (
        <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 text-[#CFE8D5]">
                {icon}
            </span>
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium uppercase tracking-[0.22em] text-[#CFE8D5]/70">
                        {eyebrow}
                    </p>
                    {badge && (
                        <span className="rounded-full border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 px-2 py-0.5 text-[10px] font-semibold text-[#CFE8D5]">
                            {badge}
                        </span>
                    )}
                </div>
                <h2 className={cn("font-semibold text-zinc-50", compact ? "text-lg" : "text-xl")}>
                    {title}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">{description}</p>
            </div>
        </div>
    );
}

function QualityBadges({ author, best }: { author: Author; best: boolean }) {
    const badges = [
        best && { label: "Verified", icon: <ShieldCheck className="size-3.5" /> },
        author.reputation >= 100 && { label: "Top Contributor", icon: <Trophy className="size-3.5" /> },
        { label: "AI Assisted", icon: <Sparkles className="size-3.5" /> },
    ].filter(Boolean) as { label: string; icon: React.ReactNode }[];

    return (
        <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
                <span
                    key={badge.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-400"
                >
                    <span className="text-[#CFE8D5]">{badge.icon}</span>
                    {badge.label}
                </span>
            ))}
        </div>
    );
}

function SidebarCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/20 backdrop-blur-xl">
            {children}
        </div>
    );
}

function SidebarTitle({
    icon,
    title,
    badge,
}: {
    icon: React.ReactNode;
    title: string;
    badge?: string;
}) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <span className="text-[#CFE8D5]">{icon}</span>
                {title}
            </div>
            {badge && (
                <span className="rounded-full border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 px-2 py-0.5 text-[10px] font-semibold text-[#CFE8D5]">
                    {badge}
                </span>
            )}
        </div>
    );
}

function ActivityRow({ value, label, time }: { value: number; label: string; time: string }) {
    return (
        <div className="grid grid-cols-[48px_1fr_auto] items-center gap-3 py-3">
            <span className="text-xl font-semibold text-zinc-100">{formatCount(value)}</span>
            <span className="text-sm text-zinc-500">{label}</span>
            <span className="text-xs text-zinc-600">{time}</span>
        </div>
    );
}

function StatTile({ value, label }: { value: string; label: string }) {
    return (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-lg font-semibold text-zinc-100">{value}</p>
            <p className="mt-1 text-xs text-zinc-500">{label}</p>
        </div>
    );
}

function SidebarAuthorCard({ author, createdAt }: { author: Author; createdAt: string }) {
    return (
        <SidebarCard>
            <SidebarTitle icon={<UserRound className="size-4" />} title="Author" />
            <div className="mt-4 flex items-center gap-3">
                <Avatar name={author.name} large />
                <div className="min-w-0">
                    <Link
                        href={`/users/${author.$id}/${slugify(author.name)}`}
                        className="block truncate text-sm font-semibold text-zinc-100 transition hover:text-[#CFE8D5]"
                    >
                        {author.name}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                        {formatCount(author.reputation)} reputation
                    </p>
                </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-zinc-500">
                Asked {convertDateToRelativeTime(new Date(createdAt))}
            </div>
        </SidebarCard>
    );
}

function AuthorSignature({ label, author }: { label: string; author: Author }) {
    return (
        <div className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 backdrop-blur-xl sm:w-[280px]">
            <Avatar name={author.name} />
            <div className="min-w-0">
                <p className="text-xs text-zinc-500">{label}</p>
                <Link
                    href={`/users/${author.$id}/${slugify(author.name)}`}
                    className="block truncate text-sm font-semibold text-[#CFE8D5] transition hover:text-white"
                >
                    {author.name}
                </Link>
                <p className="mt-1 text-xs text-zinc-500">{formatCount(author.reputation)} reputation</p>
            </div>
        </div>
    );
}

function Avatar({
    name,
    small,
    large,
}: {
    name: string;
    small?: boolean;
    large?: boolean;
}) {
    return (
        <span
            className={cn(
                "flex shrink-0 items-center justify-center rounded-full border border-[#CFE8D5]/25 bg-[linear-gradient(135deg,#CFE8D5,#7BA98A)] font-bold text-[#07100B] shadow-lg shadow-black/20",
                small ? "size-8 text-[10px]" : large ? "size-14 text-base" : "size-11 text-sm"
            )}
        >
            {getInitials(name)}
        </span>
    );
}

function IconButton({
    label,
    active,
    icon,
    onClick,
}: {
    label: string;
    active?: boolean;
    icon: React.ReactNode;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-label={label}
            onClick={onClick}
            className={cn(
                "flex size-11 items-center justify-center rounded-xl border transition duration-200 hover:-translate-y-0.5",
                active
                    ? "border-[#CFE8D5]/40 bg-[#CFE8D5]/15 text-[#CFE8D5]"
                    : "border-white/10 bg-white/[0.035] text-zinc-400 hover:border-[#CFE8D5]/30 hover:text-[#CFE8D5]"
            )}
        >
            {icon}
        </button>
    );
}

function MetaItem({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            {icon}
            {label}
        </span>
    );
}

function TagPill({ tag, compact }: { tag: string; compact?: boolean }) {
    return (
        <Link
            href={`/questions?tag=${encodeURIComponent(tag)}`}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.055] text-xs font-medium text-zinc-300 transition hover:-translate-y-0.5 hover:border-[#CFE8D5]/35 hover:bg-[#CFE8D5]/10 hover:text-[#CFE8D5]",
                compact ? "px-2.5 py-1" : "px-3 py-1.5"
            )}
        >
            <Tag className="size-3" />
            {tag}
        </Link>
    );
}

interface AISummary {
    overview: string;
    short: string;
    answer: string;
    codeHint: string;
    checks: string[];
    sidebarBullets: string[];
}

interface RelatedConcept {
    title: string;
    source: string;
    href: string;
    icon: React.ReactNode;
}

interface LearningResource {
    title: string;
    description: string;
    href: string;
    icon: React.ReactNode;
}

interface SimilarQuestion {
    title: string;
    answers: number;
    href: string;
}

function buildAiSummary(title: string, content: string, tags: string[]): AISummary {
    const haystack = `${title} ${content} ${tags.join(" ")}`.toLowerCase();
    const primary = tags[0] ? formatCollectiveName(tags[0]) : "the implementation";
    const isReactEffect = haystack.includes("useeffect") || haystack.includes("hook");
    const isAsync = haystack.includes("fetch") || haystack.includes("async") || haystack.includes("api");

    if (isReactEffect) {
        return {
            overview:
                "The likely issue is lifecycle-related: React may be remounting the component in development, the effect may be gated by conditional rendering, or an async branch may fail before the expected state update.",
            short:
                "Check Strict Mode remounts, conditional rendering, and silent async failures before changing the dependency array.",
            answer:
                "Start by confirming the component actually mounts, then isolate whether the effect is being replayed by React Strict Mode in development. If the dependency array is empty, the effect should run on mount, so the next suspects are remount behavior, conditional rendering, or an exception inside the async work.",
            codeHint:
                "useEffect(() => {\n  console.log('mounted');\n\n  let cancelled = false;\n  fetch('/api/data')\n    .then((res) => res.json())\n    .then((data) => {\n      if (!cancelled) setData(data);\n    })\n    .catch(console.error);\n\n  return () => {\n    cancelled = true;\n  };\n}, []);",
            checks: [
                "Run the component outside development Strict Mode to compare mount behavior.",
                "Log before the async call so thrown requests do not hide the effect.",
                "Verify the component is rendered on the initial route state.",
            ],
            sidebarBullets: [
                "React Strict Mode can replay effects in development.",
                "Conditional rendering can delay the initial mount.",
                "Thrown async work can look like the effect never ran.",
            ],
        };
    }

    return {
        overview: `The fastest path is to reduce the ${primary} problem to one reproducible signal, verify the failing boundary, and then compare the expected data flow against what the runtime actually receives.`,
        short: `Focus on a minimal reproduction, boundary checks, and one confirmed runtime signal for ${primary}.`,
        answer:
            "Create the smallest reproduction that still fails, add one log or assertion at each boundary, and avoid changing multiple variables at once. Once you know whether the issue is data shape, lifecycle order, or rendering state, the fix is usually much narrower.",
        codeHint:
            "console.group('ByteNest debug');\nconsole.log('input', input);\nconsole.log('state', state);\nconsole.log('result', result);\nconsole.groupEnd();",
        checks: [
            "Confirm the input shape at the boundary.",
            isAsync ? "Handle rejected async work explicitly." : "Check for stale state or derived values.",
            "Compare the minimal reproduction against the full implementation.",
        ],
        sidebarBullets: [
            "Start with the smallest reproducible case.",
            "Instrument the failing boundary.",
            "Prefer one verified signal over broad guessing.",
        ],
    };
}

function buildRelatedConcepts(tags: string[], title: string): RelatedConcept[] {
    const seeds = tags.length ? tags : title.split(/\s+/).slice(0, 3);
    const concepts = seeds.slice(0, 3).map((tag, index) => ({
        title: `${formatCollectiveName(tag)} ${index === 0 ? "Fundamentals" : index === 1 ? "Patterns" : "Debugging"}`,
        source: index === 0 ? "Docs" : index === 1 ? "Guide" : "Learn",
        href: `/questions?tag=${encodeURIComponent(tag.toLowerCase())}`,
        icon: index === 0 ? <BookOpen className="size-4" /> : index === 1 ? <Code2 className="size-4" /> : <Zap className="size-4" />,
    }));

    return concepts.length
        ? concepts
        : [
              {
                  title: "Debugging Fundamentals",
                  source: "Guide",
                  href: "/questions",
                  icon: <Lightbulb className="size-4" />,
              },
          ];
}

function buildLearningResources(tags: string[], title: string): LearningResource[] {
    const primary = tags[0] || title.split(/\s+/)[0] || "debugging";
    const secondary = tags[1] || "architecture";
    const tertiary = tags[2] || "testing";

    return [
        {
            title: `${formatCollectiveName(primary)} deep dive`,
            description: "Core mechanics, common failure modes, and mental models.",
            href: `/questions?tag=${encodeURIComponent(primary)}`,
            icon: <BookOpen className="size-5" />,
        },
        {
            title: `${formatCollectiveName(secondary)} examples`,
            description: "Applied patterns from similar production questions.",
            href: `/questions?tag=${encodeURIComponent(secondary)}`,
            icon: <Code2 className="size-5" />,
        },
        {
            title: `${formatCollectiveName(tertiary)} checklist`,
            description: "A practical sequence for validating the final fix.",
            href: `/questions?tag=${encodeURIComponent(tertiary)}`,
            icon: <CircleCheck className="size-5" />,
        },
    ];
}

function buildSimilarQuestions(tags: string[], title: string): SimilarQuestion[] {
    const primary = tags[0] || "debugging";
    const secondary = tags[1] || "state";
    const readablePrimary = formatCollectiveName(primary);
    const readableSecondary = formatCollectiveName(secondary);

    return [
        {
            title: `${readablePrimary} fails only on first render`,
            answers: 12,
            href: `/questions?tag=${encodeURIComponent(primary)}`,
        },
        {
            title: `How to isolate ${readableSecondary} lifecycle issues`,
            answers: 8,
            href: `/questions?search=${encodeURIComponent(title.split(/\s+/).slice(0, 5).join(" "))}`,
        },
        {
            title: `Production-safe debugging for ${readablePrimary}`,
            answers: 15,
            href: `/questions?tag=${encodeURIComponent(primary)}`,
        },
    ];
}

function buildTrendingTags(tags: string[]) {
    return Array.from(new Set([...tags, "ai-assisted", "react", "typescript", "debugging", "performance"])).slice(0, 8);
}

function getAnswerScore(answer: AnswerDoc) {
    return Number(answer.upvotesDocuments?.total ?? 0) - Number(answer.downvotesDocuments?.total ?? 0);
}

function getInitials(name: string) {
    return (
        name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase())
            .join("") || "?"
    );
}

function formatCount(value: number) {
    return new Intl.NumberFormat("en", {
        notation: Math.abs(value) >= 1000 ? "compact" : "standard",
        maximumFractionDigits: 1,
    }).format(value);
}

function formatCollectiveName(tag: string) {
    return tag
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => (part.length <= 2 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)))
        .join(" ");
}
