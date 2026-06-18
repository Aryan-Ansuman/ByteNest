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
    () => import("@uiw/react-md-editor").then((m) => m.default.Markdown),
    { ssr: false }
);

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Main Component ───────────────────────────────────────────────────────────

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
    const [questionVotedDoc, setQuestionVotedDoc] = React.useState<Models.Document | null | undefined>(undefined);
    const [questionVoteResult, setQuestionVoteResult] = React.useState(upvotes.total - downvotes.total);

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
            if (answerSort === "Oldest") return new Date(a.$createdAt).getTime() - new Date(b.$createdAt).getTime();
            if (answerSort === "Active") return new Date(b.$updatedAt).getTime() - new Date(a.$updatedAt).getTime();
            return getAnswerScore(b) - getAnswerScore(a);
        });
    }, [answers.documents, answerSort]);

    const bestAnswer = React.useMemo(() => {
        return [...answers.documents].sort((a, b) => getAnswerScore(b) - getAnswerScore(a))[0] ?? null;
    }, [answers.documents]);

    const communityAnswers = React.useMemo(
        () => bestAnswer ? sortedAnswers.filter((a) => a.$id !== bestAnswer.$id) : sortedAnswers,
        [bestAnswer, sortedAnswers]
    );
    const visibleCommunityAnswers = communityAnswers.slice(0, visibleAnswerCount);

    React.useEffect(() => { setVisibleAnswerCount(DEFAULT_VISIBLE_ANSWERS); }, [answerSort]);

    React.useEffect(() => {
        if (!user) return;
        databases.listDocuments(db, voteCollection, [
            Query.equal("type", "question"),
            Query.equal("typeId", question.$id),
            Query.equal("votedById", user.$id),
        ])
            .then((r) => setQuestionVotedDoc(r.documents[0] || null))
            .catch(() => setQuestionVotedDoc(null));
    }, [user, question.$id]);

    const handleQuestionVote = async (status: "upvoted" | "downvoted") => {
        if (!user) return router.push("/login");
        if (questionVotedDoc === undefined) return;
        try {
            const response = await fetch("/api/vote", {
                method: "POST",
                body: JSON.stringify({ votedById: user.$id, voteStatus: status, type: "question", typeId: question.$id }),
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
        if (!user) { router.push("/login"); return; }
        setShowAnswerEditor((v) => !v);
    };

    const handleSubmitAnswer = async () => {
        if (!newAnswer.trim() || !user) return;
        setIsSubmittingAnswer(true);
        setAnswerError("");
        try {
            const response = await fetch("/api/answer", {
                method: "POST",
                body: JSON.stringify({ questionId: question.$id, answer: newAnswer, authorId: user.$id }),
            });
            const data = await response.json();
            if (!response.ok) throw data;
            setNewAnswer("");
            setShowAnswerEditor(false);
            setAnswers((prev) => ({
                total: prev.total + 1,
                documents: [{
                    ...data,
                    author: { $id: user.$id, name: user.name, reputation: user.prefs?.reputation ?? 0 },
                    upvotesDocuments: { documents: [], total: 0 },
                    downvotesDocuments: { documents: [], total: 0 },
                    comments: { documents: [], total: 0 },
                } as AnswerDoc, ...prev.documents],
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
            const response = await fetch("/api/answer", { method: "DELETE", body: JSON.stringify({ answerId }) });
            if (!response.ok) throw await response.json();
            setAnswers((prev) => ({ total: prev.total - 1, documents: prev.documents.filter((a) => a.$id !== answerId) }));
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
        <div className="relative mx-auto w-full max-w-[1420px] pb-20">
            {/* Ambient glow */}
            <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[500px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(207,232,213,0.08),transparent)]" />

            {/* Back navigation */}
            <Link href="/questions" className="mb-7 inline-flex items-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-200">
                <ArrowLeft className="size-4" />
                Back to Questions
            </Link>

            {/* ── Two-column grid ── */}
            <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px] 2xl:grid-cols-[minmax(0,1fr)_400px]">

                {/* ════════════════════════════════════════
                    MAIN COLUMN
                    ════════════════════════════════════════ */}
                <main className="min-w-0 space-y-5">

                    {/* ── 1. Question Hero ── */}
                    <QuestionHero
                        question={question}
                        author={{ $id: author.$id, name: author.name, reputation: Number(author.prefs?.reputation ?? 0) }}
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
                        onBookmark={() => setBookmarked((v) => !v)}
                        onSave={() => setSaved((v) => !v)}
                        isOwner={user?.$id === question.authorId}
                        editHref={`/questions/${question.$id}/${slugify(question.title as string)}/edit`}
                        onDelete={handleDeleteQuestion}
                    />

                    {/* ── 2. AI Summary ── */}
                    <AISummaryCard
                        summary={aiSummary}
                        showFollowUp={showAiFollowUp}
                        followUpValue={aiFollowUp}
                        onToggleFollowUp={() => setShowAiFollowUp((v) => !v)}
                        onFollowUpChange={setAiFollowUp}
                    />

                    {/* ── 3. AI Answer ── */}
                    <AIAnswerCard summary={aiSummary} tags={questionTags} />

                    {/* ── 4. Learning Resources ── */}
                    <LearningResourcesCard resources={learningResources} />

                    {/* ── 5. Best Solution ── */}
                    {bestAnswer ? (
                        <BestSolutionSection answer={bestAnswer} user={user} onDelete={handleDeleteAnswer} />
                    ) : (
                        <NoBestSolution onAsk={handleOpenAnswerEditor} loggedIn={Boolean(user)} />
                    )}

                    {/* ── 6. Community Answers ── */}
                    <CommunityAnswersSection
                        answers={visibleCommunityAnswers}
                        totalAnswers={communityAnswers.length}
                        remainingCount={Math.max(communityAnswers.length - visibleAnswerCount, 0)}
                        answerSort={answerSort}
                        onSortChange={setAnswerSort}
                        onShowMore={() => setVisibleAnswerCount((c) => c + DEFAULT_VISIBLE_ANSWERS)}
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

                    {/* ── 7. Discussion ── */}
                    <section id="discussion" className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 backdrop-blur-xl">
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

                {/* ════════════════════════════════════════
                    RIGHT SIDEBAR
                    ════════════════════════════════════════ */}
                <QuestionSidebar
                    aiSummary={aiSummary}
                    relatedConcepts={relatedConcepts}
                    questionTags={questionTags}
                    similarQuestions={buildSimilarQuestions(questionTags, String(question.title ?? ""))}
                    activity={{ answers: answers.total, comments: totalComments, views: totalViews }}
                    stats={{ votes: questionVoteResult, answers: answers.total, views: totalViews, comments: totalComments }}
                    author={{ $id: author.$id, name: author.name, reputation: Number(author.prefs?.reputation ?? 0) }}
                    createdAt={question.$createdAt}
                />
            </div>
        </div>
    );
}

// ─── Question Hero ─────────────────────────────────────────────────────────────

function QuestionHero({
    question, author, questionTags, totalViews, collectiveLabel,
    questionVoteResult, votedStatus, onVote, bookmarked, saved, copied,
    attachmentUrl, onShare, onBookmark, onSave, isOwner, editHref, onDelete,
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
        <article id="question" className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-2xl shadow-black/40 backdrop-blur-xl">
            {/* Top shimmer line */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#CFE8D5]/60 to-transparent" />
            {/* Corner glow */}
            <div className="pointer-events-none absolute right-0 top-0 h-64 w-1/2 bg-[radial-gradient(ellipse_at_top_right,rgba(207,232,213,0.09),transparent_60%)]" />

            <header className="relative p-6 sm:p-8">
                {/* Badges row */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#CFE8D5]/25 bg-[#CFE8D5]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#CFE8D5]">
                        <Sparkles className="size-3" />
                        AI Indexed
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-zinc-400">
                        <Layers3 className="size-3" />
                        {collectiveLabel}
                    </span>
                </div>

                {/* Title + action icons */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <h1 className="max-w-3xl text-2xl font-bold leading-snug tracking-tight text-zinc-50 sm:text-3xl lg:text-4xl">
                        {question.title}
                    </h1>
                    <div className="flex shrink-0 items-center gap-2">
                        <IconButton label="Share" active={copied} onClick={onShare} icon={copied ? <Check className="size-4" /> : <Share2 className="size-4" />} />
                        <IconButton label="Save" active={saved} onClick={onSave} icon={<Bookmark className="size-4" fill={saved ? "currentColor" : "none"} />} />
                        <IconButton label="Follow" active={bookmarked} onClick={onBookmark} icon={<Star className="size-4" fill={bookmarked ? "currentColor" : "none"} />} />
                    </div>
                </div>

                {/* Meta row */}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-zinc-500">
                    <MetaItem icon={<UserRound className="size-3.5" />} label={author.name} />
                    <MetaItem icon={<Clock3 className="size-3.5" />} label={`Asked ${convertDateToRelativeTime(new Date(question.$createdAt))}`} />
                    <MetaItem icon={<Timer className="size-3.5" />} label={`Updated ${convertDateToRelativeTime(new Date(question.$updatedAt))}`} />
                    <MetaItem icon={<Eye className="size-3.5" />} label={`${formatCount(totalViews)} views`} />
                </div>

                {/* Tags */}
                {questionTags.length > 0 && (
                    <div className="mt-5 flex flex-wrap gap-2">
                        {questionTags.map((tag) => <TagPill key={tag} tag={tag} />)}
                    </div>
                )}
            </header>

            {/* Content area with vote rail */}
            <div className="grid gap-5 border-t border-white/[0.07] p-5 sm:p-7 lg:grid-cols-[56px_minmax(0,1fr)]">
                <VoteRail voteResult={questionVoteResult} votedStatus={votedStatus} onVote={onVote} bookmarked={bookmarked} onBookmark={onBookmark} />

                <div className="min-w-0">
                    {/* Sticky action bar */}
                    <StickyActionBar
                        copied={copied} saved={saved} bookmarked={bookmarked} isOwner={isOwner}
                        onShare={onShare} onSave={onSave} onBookmark={onBookmark}
                        editHref={editHref} onDelete={onDelete}
                    />

                    {/* Markdown content */}
                    <div className="question-detail-markdown mt-5" data-color-mode="dark">
                        <MarkdownPreview source={String(question.content ?? "")} />
                    </div>

                    {/* Attachment */}
                    {attachmentUrl && (
                        <div className="mt-6 overflow-hidden rounded-xl border border-white/[0.08] bg-black/30 p-2">
                            <img src={attachmentUrl} alt="Question attachment" className="max-h-[400px] w-full rounded-lg object-contain" />
                        </div>
                    )}

                    {/* Author signature */}
                    <div className="mt-7 flex flex-col gap-4 border-t border-white/[0.07] pt-5 lg:flex-row lg:items-center lg:justify-between">
                        <p className="max-w-lg text-sm leading-relaxed text-zinc-500">
                            ByteNest surfaces the strongest path — ranked by clarity, reproducibility, and community confirmation.
                        </p>
                        <AuthorSignature label={`asked ${convertDateToRelativeTime(new Date(question.$createdAt))}`} author={author} />
                    </div>
                </div>
            </div>
        </article>
    );
}

// ─── AI Summary Card ──────────────────────────────────────────────────────────

function AISummaryCard({ summary, showFollowUp, followUpValue, onToggleFollowUp, onFollowUpChange }: {
    summary: AISummary;
    showFollowUp: boolean;
    followUpValue: string;
    onToggleFollowUp: () => void;
    onFollowUpChange: (v: string) => void;
}) {
    return (
        <section id="ai-summary" className="relative overflow-hidden rounded-2xl border border-[#CFE8D5]/20 bg-[linear-gradient(135deg,rgba(207,232,213,0.1),rgba(255,255,255,0.03)_50%,rgba(0,0,0,0.1))] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-[#CFE8D5]/70 to-transparent" />

            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1">
                    <div className="mb-3 flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 text-[#CFE8D5]">
                            <Brain className="size-4" />
                        </span>
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#CFE8D5]/60">AI Summary</p>
                            <h2 className="text-lg font-bold text-zinc-50">Likely solution path</h2>
                        </div>
                        <span className="ml-1 rounded-full border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 px-2 py-0.5 text-[10px] font-semibold text-[#CFE8D5]">Beta</span>
                    </div>
                    <p className="max-w-2xl text-sm leading-7 text-zinc-300">{summary.overview}</p>
                </div>

                <button
                    onClick={onToggleFollowUp}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#07100B] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#ddf3e2] hover:shadow-lg hover:shadow-[#CFE8D5]/10"
                >
                    <Sparkles className="size-4" />
                    Ask AI Follow-up
                </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {summary.checks.map((check) => (
                    <div key={check} className="rounded-xl border border-white/[0.08] bg-black/25 p-4 text-sm leading-6 text-zinc-300 transition-colors hover:bg-black/35">
                        <CircleCheck className="mb-2.5 size-4 text-[#CFE8D5]" />
                        {check}
                    </div>
                ))}
            </div>

            <AnimatePresence>
                {showFollowUp && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        className="mt-5 overflow-hidden rounded-xl border border-white/[0.08] bg-black/30 p-3"
                    >
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <input
                                value={followUpValue}
                                onChange={(e) => onFollowUpChange(e.target.value)}
                                placeholder="Ask about edge cases, errors, or implementation tradeoffs…"
                                className="min-h-11 flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#CFE8D5]/40 transition-colors"
                                autoFocus
                            />
                            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 px-4 text-sm font-medium text-[#CFE8D5] transition hover:bg-[#CFE8D5]/20">
                                <Send className="size-4" />
                                Ask
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </section>
    );
}

// ─── AI Answer Card ───────────────────────────────────────────────────────────

function AIAnswerCard({ summary, tags }: { summary: AISummary; tags: string[] }) {
    return (
        <section id="ai-answer" className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 backdrop-blur-xl">
            <SectionHeader
                eyebrow="AI Answer"
                title="Synthesized first pass"
                description="Generated from question context and community patterns"
                icon={<Bot className="size-4" />}
                badge="Beta"
            />
            <div className="mt-5 space-y-4 text-sm leading-7 text-zinc-300">
                <p>{summary.answer}</p>
                <div className="rounded-xl border border-white/[0.07] bg-black/30 p-4">
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        <Code2 className="size-3.5" />
                        Suggested debug path
                    </div>
                    <pre className="overflow-x-auto rounded-lg border border-white/[0.07] bg-[#060806] p-4 text-[13px] leading-6 text-[#CFE8D5]">
                        <code>{summary.codeHint}</code>
                    </pre>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                    {(tags.length ? tags : ["debugging", "architecture", "patterns"]).slice(0, 4).map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-zinc-400">
                            <Hash className="size-3" />
                            {tag}
                        </span>
                    ))}
                </div>
            </div>
        </section>
    );
}

// ─── Learning Resources ───────────────────────────────────────────────────────

function LearningResourcesCard({ resources }: { resources: LearningResource[] }) {
    return (
        <section id="resources" className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 backdrop-blur-xl">
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
                        className="group rounded-xl border border-white/[0.07] bg-black/20 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#CFE8D5]/20 hover:bg-[#CFE8D5]/[0.05]"
                    >
                        <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[#CFE8D5]">
                            {resource.icon}
                        </div>
                        <p className="font-semibold text-zinc-100">{resource.title}</p>
                        <p className="mt-1.5 text-sm leading-5 text-zinc-500">{resource.description}</p>
                        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#CFE8D5]/70 transition group-hover:text-[#CFE8D5]">
                            Open resource
                            <ArrowRight className="size-3" />
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    );
}

// ─── Best Solution ────────────────────────────────────────────────────────────

function BestSolutionSection({ answer, user, onDelete }: { answer: AnswerDoc; user: Models.User<any> | null; onDelete: (id: string) => void }) {
    return (
        <section id="best-solution">
            <div className="relative overflow-hidden rounded-2xl border border-[#CFE8D5]/20 bg-[linear-gradient(135deg,rgba(207,232,213,0.1),rgba(255,255,255,0.025)_60%,rgba(0,0,0,0.15))] p-5 shadow-[0_0_50px_rgba(207,232,213,0.06)] backdrop-blur-xl">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#CFE8D5]/50 to-transparent" />
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <SectionHeader
                        eyebrow="Best Solution"
                        title="Community accepted path"
                        description="Highlighted separately — highest vote score in this thread"
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

// ─── Community Answers Section ────────────────────────────────────────────────

function CommunityAnswersSection({
    answers, totalAnswers, remainingCount, answerSort, onSortChange,
    onShowMore, onOpenEditor, showAnswerEditor, newAnswer, onNewAnswerChange,
    isSubmittingAnswer, answerError, onSubmitAnswer, onCancelAnswer, user, onDeleteAnswer,
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
    onNewAnswerChange: (v: string) => void;
    isSubmittingAnswer: boolean;
    answerError: string;
    onSubmitAnswer: () => void;
    onCancelAnswer: () => void;
    user: Models.User<any> | null;
    onDeleteAnswer: (id: string) => void;
}) {
    return (
        <section id="community-answers" className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 backdrop-blur-xl">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <SectionHeader
                    eyebrow="Community Answers"
                    title={`${totalAnswers} answer${totalAnswers === 1 ? "" : "s"}`}
                    description="Peer-tested solutions and implementation notes"
                    icon={<Users className="size-4" />}
                />
                <div className="flex flex-wrap items-center gap-3">
                    {totalAnswers > 1 && (
                        <div className="inline-flex rounded-xl border border-white/[0.08] bg-black/25 p-1">
                            {(["Oldest", "Votes", "Active"] as AnswerSort[]).map((sort) => (
                                <button
                                    key={sort}
                                    onClick={() => onSortChange(sort)}
                                    className={cn(
                                        "h-8 rounded-lg px-3 text-xs font-medium transition-all duration-200",
                                        answerSort === sort
                                            ? "bg-[#CFE8D5] text-[#07100B]"
                                            : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-100"
                                    )}
                                >
                                    {sort === "Votes" ? "Most Voted" : sort}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        onClick={onOpenEditor}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#ddf3e2]"
                    >
                        <Plus className="size-4" />
                        Answer
                    </button>
                </div>
            </div>

            {/* Answer editor */}
            <AnimatePresence>
                {showAnswerEditor && (
                    <motion.div
                        initial={{ opacity: 0, y: -8, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -8, height: 0 }}
                        className="mt-5 overflow-hidden rounded-2xl border border-white/[0.08] bg-black/30 p-4"
                    >
                        <h3 className="mb-4 text-sm font-semibold text-zinc-300">Share a community answer</h3>
                        <div data-color-mode="dark">
                            <MDEditor
                                value={newAnswer}
                                onChange={(v) => onNewAnswerChange(v || "")}
                                height={280}
                                preview="live"
                                textareaProps={{ placeholder: "Share a clear solution, explanation, or example." }}
                                style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", overflow: "hidden" }}
                            />
                        </div>
                        {answerError && <p className="mt-3 text-sm text-red-400">{answerError}</p>}
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <Button
                                onClick={onSubmitAnswer}
                                disabled={isSubmittingAnswer || !newAnswer.trim()}
                                className="h-9 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-5 text-sm font-semibold text-[#08100B] shadow-none hover:bg-[#ddf3e2] disabled:opacity-50"
                            >
                                {isSubmittingAnswer ? "Posting…" : "Post Answer"}
                                {!isSubmittingAnswer && <Send className="size-3.5" />}
                            </Button>
                            <button onClick={onCancelAnswer} className="h-9 rounded-xl border border-white/[0.08] px-4 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200">
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Answer list */}
            <div className="mt-5 space-y-4">
                {answers.length === 0 ? (
                    <EmptyAnswers onAsk={onOpenEditor} loggedIn={Boolean(user)} />
                ) : (
                    answers.map((answer) => (
                        <AnswerCard key={answer.$id} answer={answer} user={user} onDelete={onDeleteAnswer} />
                    ))
                )}
            </div>

            {/* Show more */}
            {remainingCount > 0 && (
                <button
                    onClick={onShowMore}
                    className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-black/20 text-sm font-medium text-zinc-400 transition hover:border-[#CFE8D5]/20 hover:bg-[#CFE8D5]/[0.05] hover:text-[#CFE8D5]"
                >
                    Show {remainingCount} more answer{remainingCount === 1 ? "" : "s"}
                    <ChevronDown className="size-4" />
                </button>
            )}

            {/* Sign-in prompt */}
            {!user && (
                <div className="mt-5 rounded-xl border border-[#CFE8D5]/10 bg-[#CFE8D5]/[0.035] p-4 text-center">
                    <p className="text-sm text-zinc-400">
                        Know the answer?{" "}
                        <Link href="/login" className="font-medium text-[#CFE8D5] hover:text-white">Log in</Link>
                        {" "}or{" "}
                        <Link href="/register" className="font-medium text-[#CFE8D5] hover:text-white">sign up</Link>
                        {" "}to share it.
                    </p>
                </div>
            )}
        </section>
    );
}

// ─── Right Sidebar ────────────────────────────────────────────────────────────

function QuestionSidebar({ aiSummary, relatedConcepts, questionTags, similarQuestions, activity, stats, author, createdAt }: {
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
            {/* AI Summary */}
            <SidebarCard>
                <SidebarTitle icon={<Sparkles className="size-4" />} title="AI Summary" badge="Beta" />
                <p className="mt-3 text-sm leading-6 text-zinc-400">{aiSummary.short}</p>
                <ul className="mt-3 space-y-2">
                    {aiSummary.sidebarBullets.map((bullet) => (
                        <li key={bullet} className="flex gap-2 text-sm leading-6 text-zinc-400">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[#CFE8D5]" />
                            {bullet}
                        </li>
                    ))}
                </ul>
                <button className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] text-sm font-medium text-zinc-300 transition hover:border-[#CFE8D5]/20 hover:text-[#CFE8D5]">
                    <Bot className="size-4" />
                    Ask AI follow-up
                </button>
            </SidebarCard>

            {/* On This Page */}
            <SidebarCard>
                <SidebarTitle icon={<ListTree className="size-4" />} title="On This Page" />
                <nav className="mt-3 space-y-0.5">
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
                            <ArrowRight className="size-3 opacity-50" />
                        </a>
                    ))}
                </nav>
            </SidebarCard>

            {/* Related Concepts */}
            <SidebarCard>
                <SidebarTitle icon={<Lightbulb className="size-4" />} title="Related Concepts" />
                <div className="mt-3 space-y-2">
                    {relatedConcepts.map((concept) => (
                        <Link
                            key={concept.title}
                            href={concept.href}
                            className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 transition hover:border-[#CFE8D5]/20 hover:bg-[#CFE8D5]/[0.05]"
                        >
                            <span className="flex size-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[#CFE8D5]">
                                {concept.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-zinc-100">{concept.title}</span>
                                <span className="text-xs text-zinc-500">{concept.source}</span>
                            </span>
                            <ExternalLink className="size-3.5 text-zinc-600 transition group-hover:text-[#CFE8D5]" />
                        </Link>
                    ))}
                </div>
            </SidebarCard>

            {/* Similar Questions */}
            <SidebarCard>
                <SidebarTitle icon={<Link2 className="size-4" />} title="Similar Questions" />
                <div className="mt-3 space-y-3">
                    {similarQuestions.map((item) => (
                        <Link key={item.title} href={item.href} className="group block">
                            <p className="text-sm font-medium leading-snug text-[#CFE8D5]/80 transition group-hover:text-[#CFE8D5]">
                                {item.title}
                            </p>
                            <p className="mt-1 text-xs text-zinc-600">{item.answers} answers</p>
                        </Link>
                    ))}
                </div>
            </SidebarCard>

            {/* Community Activity */}
            <SidebarCard>
                <SidebarTitle icon={<Activity className="size-4" />} title="Community Activity" />
                <div className="mt-3 divide-y divide-white/[0.06]">
                    <ActivityRow value={activity.answers} label="Answers added" time="today" />
                    <ActivityRow value={activity.comments} label="Comments added" time="recent" />
                    <ActivityRow value={activity.views} label="People viewed" time="lifetime" />
                </div>
                <div className="mt-4 flex items-center">
                    {["AL", "JS", "TS", "RX", "AI"].map((initials, i) => (
                        <span
                            key={initials}
                            className="-ml-2 first:ml-0 flex size-7 items-center justify-center rounded-full border border-black bg-[#CFE8D5] text-[9px] font-bold text-[#07100B]"
                            style={{ zIndex: 10 - i }}
                        >
                            {initials}
                        </span>
                    ))}
                    <span className="-ml-2 flex size-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[10px] text-[#CFE8D5]">+8</span>
                </div>
            </SidebarCard>

            {/* Question Stats */}
            <SidebarCard>
                <SidebarTitle icon={<BarChart3 className="size-4" />} title="Question Stats" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                    <StatTile label="Votes" value={formatCount(stats.votes)} />
                    <StatTile label="Answers" value={formatCount(stats.answers)} />
                    <StatTile label="Views" value={formatCount(stats.views)} />
                    <StatTile label="Comments" value={formatCount(stats.comments)} />
                </div>
            </SidebarCard>

            {/* Author card */}
            <SidebarAuthorCard author={author} createdAt={createdAt} />

            {/* Trending Tags */}
            <SidebarCard>
                <SidebarTitle icon={<Flame className="size-4" />} title="Trending Tags" />
                <div className="mt-3 flex flex-wrap gap-2">
                    {buildTrendingTags(questionTags).map((tag) => <TagPill key={tag} tag={tag} compact />)}
                </div>
            </SidebarCard>
        </aside>
    );
}

// ─── Answer Card ──────────────────────────────────────────────────────────────

function AnswerCard({ answer, user, onDelete, variant = "default" }: {
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
        databases.listDocuments(db, voteCollection, [
            Query.equal("type", "answer"),
            Query.equal("typeId", answer.$id),
            Query.equal("votedById", user.$id),
        ])
            .then((r) => setVotedDoc(r.documents[0] || null))
            .catch(() => setVotedDoc(null));
    }, [user, answer.$id]);

    const handleVote = async (status: "upvoted" | "downvoted") => {
        if (!user) return router.push("/login");
        if (votedDoc === undefined) return;
        try {
            const response = await fetch("/api/vote", {
                method: "POST",
                body: JSON.stringify({ votedById: user.$id, voteStatus: status, type: "answer", typeId: answer.$id }),
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
                "grid gap-4 rounded-2xl border bg-black/20 p-5 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5 lg:grid-cols-[48px_minmax(0,1fr)]",
                variant === "best"
                    ? "border-[#CFE8D5]/20 shadow-[0_0_40px_rgba(207,232,213,0.06)]"
                    : "border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.03]"
            )}
        >
            {/* Vote rail */}
            <aside className="flex items-center gap-2 lg:flex-col">
                <VoteButton label="Upvote answer" active={votedDoc?.voteStatus === "upvoted"} onClick={() => handleVote("upvoted")}>
                    <ArrowUp className="size-4" />
                </VoteButton>
                <div className="min-w-9 text-center text-lg font-bold text-zinc-100">{voteResult}</div>
                <VoteButton label="Downvote answer" active={votedDoc?.voteStatus === "downvoted"} danger onClick={() => handleVote("downvoted")}>
                    <ArrowDown className="size-4" />
                </VoteButton>
                {variant === "best" && (
                    <span className="hidden size-8 items-center justify-center rounded-full border border-[#CFE8D5]/25 bg-[#CFE8D5]/10 text-[#CFE8D5] lg:flex">
                        <Check className="size-4" />
                    </span>
                )}
            </aside>

            {/* Content */}
            <div className="min-w-0">
                {/* Author + badges */}
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-center gap-3">
                        <Avatar name={answer.author.name} />
                        <div>
                            <Link href={`/users/${answer.author.$id}/${slugify(answer.author.name)}`} className="text-sm font-semibold text-zinc-100 transition hover:text-[#CFE8D5]">
                                {answer.author.name}
                            </Link>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                                <span>{formatCount(answer.author.reputation)} rep</span>
                                <span className="size-1 rounded-full bg-zinc-700" />
                                <span>{convertDateToRelativeTime(new Date(answer.$createdAt))}</span>
                            </div>
                        </div>
                    </div>
                    <QualityBadges author={answer.author} best={variant === "best"} />
                </div>

                {/* Markdown */}
                <div className="question-detail-markdown" data-color-mode="dark">
                    <MarkdownPreview source={answer.content} />
                </div>

                {/* Footer */}
                <div className="mt-5 flex flex-col gap-3 border-t border-white/[0.07] pt-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-500">
                        <button
                            onClick={() => setWorkedForMe((v) => !v)}
                            className={cn(
                                "inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm transition-all",
                                workedForMe
                                    ? "border-[#CFE8D5]/30 bg-[#CFE8D5]/10 text-[#CFE8D5]"
                                    : "border-white/[0.08] bg-white/[0.03] hover:border-[#CFE8D5]/20 hover:text-[#CFE8D5]"
                            )}
                        >
                            <ThumbsUp className="size-3.5" />
                            Worked for Me
                            <span className="text-xs opacity-60">{Math.max(voteResult, 0) + 12}</span>
                        </button>
                        <button
                            onClick={() => navigator.clipboard.writeText(window.location.href)}
                            className="inline-flex items-center gap-2 transition hover:text-zinc-200"
                        >
                            <Share2 className="size-4" />
                            Share
                        </button>
                        {user?.$id === answer.authorId && (
                            <button
                                onClick={() => onDelete(answer.$id)}
                                className="inline-flex items-center gap-2 text-red-400/60 transition hover:text-red-300"
                            >
                                <Trash2 className="size-4" />
                                Delete
                            </button>
                        )}
                    </div>
                    <button className="inline-flex h-8 w-fit items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-zinc-500 transition hover:border-white/15 hover:text-zinc-200">
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
                    className="mt-4"
                />
            </div>
        </motion.article>
    );
}

// ─── Comments Section ─────────────────────────────────────────────────────────

function CommentsSection({ comments, setComments, type, typeId, user, className }: {
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

    const handlePost = async (e: React.FormEvent) => {
        e.preventDefault();
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
                documents: [{
                    ...document,
                    author: { $id: user.$id, name: user.name, reputation: user.prefs?.reputation ?? 0 },
                } as CommentDoc, ...prev.documents],
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
            setComments((prev) => ({ total: prev.total - 1, documents: prev.documents.filter((c) => c.$id !== commentId) }));
        } catch (error: any) {
            window.alert(error?.message || "Failed to delete comment");
        }
    };

    const visible = expanded ? comments.documents : comments.documents.slice(0, 2);

    return (
        <div className={cn("rounded-xl border border-white/[0.06] bg-black/20 p-4", className)}>
            {visible.length > 0 ? (
                visible.map((comment) => (
                    <div key={comment.$id} className="group flex items-start gap-3 border-b border-white/[0.05] py-3 first:pt-0 last:border-0 last:pb-0">
                        <Avatar name={comment.author?.name || "User"} small />
                        <p className="flex-1 text-sm leading-relaxed text-zinc-400">
                            {comment.content}{" "}
                            <Link href={`/users/${comment.authorId}/${slugify(comment.author?.name || "user")}`} className="font-medium text-[#CFE8D5]/80 hover:text-[#CFE8D5]">
                                {comment.author?.name}
                            </Link>{" "}
                            <span className="text-zinc-600">{convertDateToRelativeTime(new Date(comment.$createdAt))}</span>
                        </p>
                        {user?.$id === comment.authorId && (
                            <button onClick={() => handleDelete(comment.$id)} className="shrink-0 text-zinc-700 opacity-0 transition hover:text-red-400 group-hover:opacity-100">
                                <Trash2 className="size-3.5" />
                            </button>
                        )}
                    </div>
                ))
            ) : (
                <p className="text-sm text-zinc-600">No discussion yet.</p>
            )}

            {comments.total > 2 && (
                <button onClick={() => setExpanded((v) => !v)} className="mt-2 text-xs text-zinc-600 transition hover:text-zinc-300">
                    {expanded ? "Show less" : `Show ${comments.total - 2} more comment${comments.total - 2 === 1 ? "" : "s"}`}
                </button>
            )}

            {showInput ? (
                <form onSubmit={handlePost} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                        autoFocus
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment…"
                        className="min-h-9 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#CFE8D5]/35 transition-colors"
                        maxLength={500}
                    />
                    <button type="submit" disabled={isPosting || !newComment.trim()} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-3 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2] disabled:opacity-50">
                        <Send className="size-3.5" />
                        Post
                    </button>
                    <button type="button" onClick={() => setShowInput(false)} className="h-9 rounded-xl border border-white/[0.08] px-3 text-sm text-zinc-500 transition hover:bg-white/[0.04] hover:text-zinc-200">
                        Cancel
                    </button>
                </form>
            ) : (
                <button
                    onClick={() => { if (!user) { router.push("/login"); return; } setShowInput(true); }}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-600 transition hover:text-zinc-300"
                >
                    <MessageCircle className="size-3.5" />
                    Add comment
                </button>
            )}
        </div>
    );
}

// ─── Small sub-components ─────────────────────────────────────────────────────

function VoteRail({ voteResult, votedStatus, onVote, bookmarked, onBookmark }: {
    voteResult: number; votedStatus?: unknown;
    onVote: (s: "upvoted" | "downvoted") => void;
    bookmarked: boolean; onBookmark: () => void;
}) {
    return (
        <aside className="flex items-center gap-3 lg:sticky lg:top-28 lg:flex-col lg:self-start">
            <VoteButton label="Upvote" active={votedStatus === "upvoted"} onClick={() => onVote("upvoted")}>
                <ArrowUp className="size-5" />
            </VoteButton>
            <div className="min-w-10 text-center text-2xl font-bold text-[#CFE8D5] lg:min-w-0">{voteResult}</div>
            <VoteButton label="Downvote" active={votedStatus === "downvoted"} danger onClick={() => onVote("downvoted")}>
                <ArrowDown className="size-5" />
            </VoteButton>
            <button
                onClick={onBookmark}
                className={cn(
                    "flex size-11 items-center justify-center rounded-xl border transition-all",
                    bookmarked
                        ? "border-[#CFE8D5]/35 bg-[#CFE8D5]/10 text-[#CFE8D5]"
                        : "border-white/[0.08] bg-white/[0.03] text-zinc-500 hover:border-white/15 hover:text-zinc-100"
                )}
            >
                <Bookmark className="size-4" fill={bookmarked ? "currentColor" : "none"} />
            </button>
        </aside>
    );
}

function VoteButton({ active, danger, label, onClick, children }: {
    active: boolean; danger?: boolean; label: string;
    onClick: () => void; children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            className={cn(
                "flex size-11 items-center justify-center rounded-xl border transition-all duration-200 hover:-translate-y-0.5",
                active && !danger && "border-[#CFE8D5]/40 bg-[#CFE8D5]/15 text-[#CFE8D5]",
                active && danger && "border-red-400/35 bg-red-400/10 text-red-300",
                !active && "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-[#CFE8D5]/25 hover:text-[#CFE8D5]",
                !active && danger && "hover:border-red-400/25 hover:text-red-300"
            )}
        >
            {children}
        </button>
    );
}

function StickyActionBar({ copied, saved, bookmarked, isOwner, onShare, onSave, onBookmark, editHref, onDelete }: {
    copied: boolean; saved: boolean; bookmarked: boolean; isOwner: boolean;
    onShare: () => void; onSave: () => void; onBookmark: () => void;
    editHref: string; onDelete: () => void;
}) {
    return (
        <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#080908]/90 p-2 shadow-xl shadow-black/30 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-2">
                <ActionButton onClick={onShare} active={copied} icon={copied ? <Check /> : <Share2 />}>{copied ? "Copied" : "Share"}</ActionButton>
                <ActionButton onClick={onSave} active={saved} icon={<Bookmark />}>{saved ? "Saved" : "Save"}</ActionButton>
                <ActionButton onClick={onBookmark} active={bookmarked} icon={<Star />}>{bookmarked ? "Following" : "Follow"}</ActionButton>
            </div>
            {isOwner && (
                <div className="flex items-center gap-2">
                    <Link href={editHref} className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] px-3 text-sm text-zinc-400 transition hover:border-white/15 hover:text-zinc-100">
                        <Pencil className="size-3.5" />
                        Edit
                    </Link>
                    <button onClick={onDelete} className="inline-flex h-9 items-center gap-2 rounded-lg border border-red-400/15 px-3 text-sm text-red-400/70 transition hover:border-red-400/30 hover:text-red-300">
                        <Trash2 className="size-3.5" />
                        Delete
                    </button>
                </div>
            )}
        </div>
    );
}

function ActionButton({ onClick, active, icon, children }: { onClick: () => void; active?: boolean; icon: React.ReactElement; children: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm transition-all",
                active
                    ? "border-[#CFE8D5]/25 bg-[#CFE8D5]/10 text-[#CFE8D5]"
                    : "border-white/[0.08] text-zinc-400 hover:border-white/15 hover:bg-white/[0.04] hover:text-zinc-100"
            )}
        >
            {React.cloneElement(icon, { className: "size-3.5" })}
            {children}
        </button>
    );
}

function NoBestSolution({ onAsk, loggedIn }: { onAsk: () => void; loggedIn: boolean }) {
    const router = useRouter();
    return (
        <section id="best-solution" className="rounded-2xl border border-[#CFE8D5]/12 bg-[#CFE8D5]/[0.025] p-8 text-center backdrop-blur-xl">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl border border-[#CFE8D5]/15 bg-[#CFE8D5]/8 text-[#CFE8D5]">
                <Trophy className="size-6" />
            </div>
            <h2 className="text-xl font-bold text-zinc-100">No best solution yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                The highest-voted answer will be highlighted here automatically.
            </p>
            <button
                onClick={() => loggedIn ? onAsk() : router.push("/login")}
                className="mt-5 inline-flex h-9 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2]"
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
        <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.07] bg-black/20 px-6 py-14 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                <MessageCircle className="size-5 text-zinc-500" />
            </div>
            <p className="font-semibold text-zinc-200">No community answers yet</p>
            <p className="mt-2 max-w-sm text-sm text-zinc-500">Be the first to add a tested fix or deeper explanation.</p>
            <button
                onClick={() => loggedIn ? onAsk() : router.push("/login")}
                className="mt-5 inline-flex h-9 items-center gap-2 rounded-xl border border-[#CFE8D5]/20 bg-[#CFE8D5] px-4 text-sm font-semibold text-[#08100B] transition hover:bg-[#ddf3e2]"
            >
                <Plus className="size-4" />
                Write an answer
            </button>
        </div>
    );
}

function SectionHeader({ eyebrow, title, description, icon, badge, compact }: {
    eyebrow: string; title: string; description: string;
    icon: React.ReactNode; badge?: string; compact?: boolean;
}) {
    return (
        <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-[#CFE8D5]/15 bg-[#CFE8D5]/8 text-[#CFE8D5]">
                {icon}
            </span>
            <div>
                <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#CFE8D5]/60">{eyebrow}</p>
                    {badge && (
                        <span className="rounded-full border border-[#CFE8D5]/15 bg-[#CFE8D5]/8 px-2 py-0.5 text-[10px] font-semibold text-[#CFE8D5]">{badge}</span>
                    )}
                </div>
                <h2 className={cn("font-bold text-zinc-50", compact ? "text-lg" : "text-xl")}>{title}</h2>
                <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
            </div>
        </div>
    );
}

function QualityBadges({ author, best }: { author: Author; best: boolean }) {
    const badges = [
        best && { label: "Verified", icon: <ShieldCheck className="size-3" /> },
        author.reputation >= 100 && { label: "Top Contributor", icon: <Trophy className="size-3" /> },
        { label: "AI Assisted", icon: <Sparkles className="size-3" /> },
    ].filter(Boolean) as { label: string; icon: React.ReactNode }[];
    return (
        <div className="flex flex-wrap gap-1.5">
            {badges.map((badge) => (
                <span key={badge.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-zinc-400">
                    <span className="text-[#CFE8D5]">{badge.icon}</span>
                    {badge.label}
                </span>
            ))}
        </div>
    );
}

function SidebarCard({ children }: { children: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 backdrop-blur-xl">
            {children}
        </div>
    );
}

function SidebarTitle({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                <span className="text-[#CFE8D5]">{icon}</span>
                {title}
            </div>
            {badge && (
                <span className="rounded-full border border-[#CFE8D5]/15 bg-[#CFE8D5]/8 px-2 py-0.5 text-[10px] font-semibold text-[#CFE8D5]">{badge}</span>
            )}
        </div>
    );
}

function ActivityRow({ value, label, time }: { value: number; label: string; time: string }) {
    return (
        <div className="grid grid-cols-[44px_1fr_auto] items-center gap-3 py-3">
            <span className="text-xl font-bold text-zinc-100">{formatCount(value)}</span>
            <span className="text-sm text-zinc-500">{label}</span>
            <span className="text-xs text-zinc-600">{time}</span>
        </div>
    );
}

function StatTile({ value, label }: { value: string; label: string }) {
    return (
        <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <p className="text-lg font-bold text-zinc-100">{value}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{label}</p>
        </div>
    );
}

function SidebarAuthorCard({ author, createdAt }: { author: Author; createdAt: string }) {
    return (
        <SidebarCard>
            <SidebarTitle icon={<UserRound className="size-4" />} title="Author" />
            <div className="mt-3 flex items-center gap-3">
                <Avatar name={author.name} large />
                <div className="min-w-0">
                    <Link href={`/users/${author.$id}/${slugify(author.name)}`} className="block truncate text-sm font-semibold text-zinc-100 transition hover:text-[#CFE8D5]">
                        {author.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-zinc-500">{formatCount(author.reputation)} reputation</p>
                </div>
            </div>
            <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 p-3 text-xs text-zinc-500">
                Asked {convertDateToRelativeTime(new Date(createdAt))}
            </div>
        </SidebarCard>
    );
}

function AuthorSignature({ label, author }: { label: string; author: Author }) {
    return (
        <div className="flex w-full items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 sm:w-[260px]">
            <Avatar name={author.name} />
            <div className="min-w-0">
                <p className="text-xs text-zinc-500">{label}</p>
                <Link href={`/users/${author.$id}/${slugify(author.name)}`} className="block truncate text-sm font-semibold text-[#CFE8D5] transition hover:text-white">
                    {author.name}
                </Link>
                <p className="mt-0.5 text-xs text-zinc-500">{formatCount(author.reputation)} rep</p>
            </div>
        </div>
    );
}

function Avatar({ name, small, large }: { name: string; small?: boolean; large?: boolean }) {
    return (
        <span className={cn(
            "flex shrink-0 items-center justify-center rounded-full border border-[#CFE8D5]/20 bg-[linear-gradient(135deg,#CFE8D5,#7BA98A)] font-bold text-[#07100B] shadow-lg shadow-black/25",
            small ? "size-7 text-[9px]" : large ? "size-12 text-sm" : "size-10 text-sm"
        )}>
            {getInitials(name)}
        </span>
    );
}

function IconButton({ label, active, icon, onClick }: { label: string; active?: boolean; icon: React.ReactNode; onClick: () => void }) {
    return (
        <button
            aria-label={label}
            onClick={onClick}
            className={cn(
                "flex size-10 items-center justify-center rounded-xl border transition-all duration-200 hover:-translate-y-0.5",
                active
                    ? "border-[#CFE8D5]/35 bg-[#CFE8D5]/12 text-[#CFE8D5]"
                    : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-[#CFE8D5]/25 hover:text-[#CFE8D5]"
            )}
        >
            {icon}
        </button>
    );
}

function MetaItem({ icon, label }: { icon: React.ReactNode; label: string }) {
    return <span className="inline-flex items-center gap-1.5">{icon}{label}</span>;
}

function TagPill({ tag, compact }: { tag: string; compact?: boolean }) {
    return (
        <Link
            href={`/questions?tag=${encodeURIComponent(tag)}`}
            className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.05] text-xs font-medium text-zinc-300 transition-all hover:-translate-y-0.5 hover:border-[#CFE8D5]/30 hover:bg-[#CFE8D5]/8 hover:text-[#CFE8D5]",
                compact ? "px-2.5 py-1" : "px-3 py-1.5"
            )}
        >
            <Tag className="size-3" />
            {tag}
        </Link>
    );
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

interface AISummary {
    overview: string;
    short: string;
    answer: string;
    codeHint: string;
    checks: string[];
    sidebarBullets: string[];
}

interface RelatedConcept { title: string; source: string; href: string; icon: React.ReactNode; }
interface LearningResource { title: string; description: string; href: string; icon: React.ReactNode; }
interface SimilarQuestion { title: string; answers: number; href: string; }

function buildAiSummary(title: string, content: string, tags: string[]): AISummary {
    const haystack = `${title} ${content} ${tags.join(" ")}`.toLowerCase();
    const primary = tags[0] ? formatCollectiveName(tags[0]) : "the implementation";
    const isReactEffect = haystack.includes("useeffect") || haystack.includes("hook");
    const isAsync = haystack.includes("fetch") || haystack.includes("async") || haystack.includes("api");

    if (isReactEffect) {
        return {
            overview: "The likely issue is lifecycle-related: React may be remounting the component in development, the effect may be gated by conditional rendering, or an async branch may fail before the expected state update.",
            short: "Check Strict Mode remounts, conditional rendering, and silent async failures before changing the dependency array.",
            answer: "Start by confirming the component actually mounts, then isolate whether the effect is being replayed by React Strict Mode in development. If the dependency array is empty, the effect should run on mount, so the next suspects are remount behavior, conditional rendering, or an exception inside the async work.",
            codeHint: "useEffect(() => {\n  console.log('mounted');\n\n  let cancelled = false;\n  fetch('/api/data')\n    .then((res) => res.json())\n    .then((data) => {\n      if (!cancelled) setData(data);\n    })\n    .catch(console.error);\n\n  return () => {\n    cancelled = true;\n  };\n}, []);",
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
        answer: "Create the smallest reproduction that still fails, add one log or assertion at each boundary, and avoid changing multiple variables at once. Once you know whether the issue is data shape, lifecycle order, or rendering state, the fix is usually much narrower.",
        codeHint: "console.group('ByteNest debug');\nconsole.log('input', input);\nconsole.log('state', state);\nconsole.log('result', result);\nconsole.groupEnd();",
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
    return seeds.slice(0, 3).map((tag, i) => ({
        title: `${formatCollectiveName(tag)} ${i === 0 ? "Fundamentals" : i === 1 ? "Patterns" : "Debugging"}`,
        source: i === 0 ? "Docs" : i === 1 ? "Guide" : "Learn",
        href: `/questions?tag=${encodeURIComponent(tag.toLowerCase())}`,
        icon: i === 0 ? <BookOpen className="size-3.5" /> : i === 1 ? <Code2 className="size-3.5" /> : <Zap className="size-3.5" />,
    }));
}

function buildLearningResources(tags: string[], title: string): LearningResource[] {
    const primary = tags[0] || title.split(/\s+/)[0] || "debugging";
    const secondary = tags[1] || "architecture";
    const tertiary = tags[2] || "testing";
    return [
        { title: `${formatCollectiveName(primary)} deep dive`, description: "Core mechanics, common failure modes, and mental models.", href: `/questions?tag=${primary}`, icon: <BookOpen className="size-4" /> },
        { title: `${formatCollectiveName(secondary)} examples`, description: "Applied patterns from similar production questions.", href: `/questions?tag=${secondary}`, icon: <Code2 className="size-4" /> },
        { title: `${formatCollectiveName(tertiary)} checklist`, description: "A practical sequence for validating the final fix.", href: `/questions?tag=${tertiary}`, icon: <CircleCheck className="size-4" /> },
    ];
}

function buildSimilarQuestions(tags: string[], title: string): SimilarQuestion[] {
    const primary = tags[0] || "debugging";
    const secondary = tags[1] || "state";
    return [
        { title: `${formatCollectiveName(primary)} fails only on first render`, answers: 12, href: `/questions?tag=${primary}` },
        { title: `How to isolate ${formatCollectiveName(secondary)} lifecycle issues`, answers: 8, href: `/questions?search=${encodeURIComponent(title.split(/\s+/).slice(0, 5).join(" "))}` },
        { title: `Production-safe debugging for ${formatCollectiveName(primary)}`, answers: 15, href: `/questions?tag=${primary}` },
    ];
}

function buildTrendingTags(tags: string[]) {
    return Array.from(new Set([...tags, "ai-assisted", "react", "typescript", "debugging", "performance"])).slice(0, 8);
}

function getAnswerScore(answer: AnswerDoc) {
    return Number(answer.upvotesDocuments?.total ?? 0) - Number(answer.downvotesDocuments?.total ?? 0);
}

function getInitials(name: string) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

function formatCount(value: number) {
    return new Intl.NumberFormat("en", {
        notation: Math.abs(value) >= 1000 ? "compact" : "standard",
        maximumFractionDigits: 1,
    }).format(value);
}

function formatCollectiveName(tag: string) {
    return tag.split(/[-_\s]+/).filter(Boolean).map((p) => (p.length <= 2 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1))).join(" ");
}