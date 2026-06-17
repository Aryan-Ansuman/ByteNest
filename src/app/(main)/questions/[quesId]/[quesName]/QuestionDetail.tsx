"use client";

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft,
    ArrowUp,
    ArrowDown,
    MessageCircle,
    Clock,
    Tag,
    Trash2,
    Pencil,
    Share2,
    Bookmark,
    Check,
    ChevronDown,
    ChevronUp,
    Send,
    Plus,
    Search,
    Bookmark as BookmarkIcon,
    HomeIcon,
    Tags,
    UserRound,
} from "lucide-react";
import { IconCaretUpFilled, IconCaretDownFilled, IconTrash } from "@tabler/icons-react";
import { ID, Models, Query } from "appwrite";
import { avatars, databases } from "@/models/client/config";
import { answerCollection, commentCollection, db, voteCollection } from "@/models/name";
import { useAuthStore } from "@/store/Auth";
import { useRouter } from "next/navigation";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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



// ─── Main Component ───────────────────────────────────────────────────────────

export default function QuestionDetail({
    question,
    author,
    answers: _answers,
    upvotes,
    downvotes,
    comments: _comments,
    attachmentUrl,
}: Props) {
    const { user } = useAuthStore();
    const router = useRouter();

    const [answers, setAnswers] = React.useState(_answers);
    const [comments, setComments] = React.useState(_comments);
    const [newAnswer, setNewAnswer] = React.useState("");
    const [isSubmittingAnswer, setIsSubmittingAnswer] = React.useState(false);
    const [answerError, setAnswerError] = React.useState("");
    const [showAnswerEditor, setShowAnswerEditor] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const [bookmarked, setBookmarked] = React.useState(false);

    // Question vote state
    const [questionVotedDoc, setQuestionVotedDoc] = React.useState<Models.Document | null | undefined>(undefined);
    const [questionVoteResult, setQuestionVoteResult] = React.useState(upvotes.total - downvotes.total);

    React.useEffect(() => {
        if (!user) return;
        databases
            .listDocuments(db, voteCollection, [
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
            const res = await fetch("/api/vote", {
                method: "POST",
                body: JSON.stringify({ votedById: user.$id, voteStatus: status, type: "question", typeId: question.$id }),
            });
            const data = await res.json();
            if (!res.ok) throw data;
            setQuestionVoteResult(data.data.voteResult);
            setQuestionVotedDoc(data.data.document);
        } catch (e: any) {
            alert(e?.message || "Vote failed");
        }
    };

    const handleShareCopy = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSubmitAnswer = async () => {
        if (!newAnswer.trim() || !user) return;
        setIsSubmittingAnswer(true);
        setAnswerError("");
        try {
            const res = await fetch("/api/answer", {
                method: "POST",
                body: JSON.stringify({ questionId: question.$id, answer: newAnswer, authorId: user.$id }),
            });
            const data = await res.json();
            if (!res.ok) throw data;
            setNewAnswer("");
            setShowAnswerEditor(false);
            setAnswers((prev) => ({
                total: prev.total + 1,
                documents: [
                    {
                        ...data,
                        author: { $id: user.$id, name: user.name, reputation: user.prefs?.reputation ?? 0 },
                        upvotesDocuments: { documents: [], total: 0 },
                        downvotesDocuments: { documents: [], total: 0 },
                        comments: { documents: [], total: 0 },
                    } as AnswerDoc,
                    ...prev.documents,
                ],
            }));
        } catch (e: any) {
            setAnswerError(e?.message || "Failed to post answer");
        } finally {
            setIsSubmittingAnswer(false);
        }
    };

    const handleDeleteAnswer = async (answerId: string) => {
        if (!confirm("Delete this answer?")) return;
        try {
            const res = await fetch("/api/answer", {
                method: "DELETE",
                body: JSON.stringify({ answerId }),
            });
            if (!res.ok) throw await res.json();
            setAnswers((prev) => ({
                total: prev.total - 1,
                documents: prev.documents.filter((a) => a.$id !== answerId),
            }));
        } catch (e: any) {
            alert(e?.message || "Failed to delete");
        }
    };

    const handleDeleteQuestion = async () => {
        if (!confirm("Delete this question permanently?")) return;
        try {
            await databases.deleteDocument(db, "questions", question.$id);
            router.push("/questions");
        } catch (e: any) {
            alert(e?.message || "Failed to delete");
        }
    };

    return (
        <div className="w-full">
            <div className="mx-auto max-w-4xl">

                        {/* ── Back link ── */}
                        <Link
                            href="/questions"
                            className="mb-5 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-300"
                        >
                            <ArrowLeft className="size-4" />
                            Back to questions
                        </Link>

                        {/* ── Question Block ── */}
                        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-6 md:p-8">
                            {/* Title row */}
                            <div className="flex items-start justify-between gap-4">
                                <h1 className="text-2xl font-bold leading-snug tracking-tight text-zinc-50 sm:text-3xl">
                                    {question.title}
                                </h1>

                                {/* Owner actions */}
                                {user?.$id === question.authorId && (
                                    <div className="flex shrink-0 items-center gap-2">
                                        <Link
                                            href={`/questions/${question.$id}/${slugify(question.title)}/edit`}
                                            className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                                            title="Edit question"
                                        >
                                            <Pencil className="size-4" />
                                        </Link>
                                        <button
                                            onClick={handleDeleteQuestion}
                                            className="flex size-9 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 transition hover:bg-red-500/15 hover:text-red-300"
                                            title="Delete question"
                                        >
                                            <Trash2 className="size-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Meta row */}
                            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-zinc-500">
                                <span className="flex items-center gap-1">
                                    <Clock className="size-3" />
                                    Asked {convertDateToRelativeTime(new Date(question.$createdAt))}
                                </span>
                                <span className="flex items-center gap-1">
                                    <MessageCircle className="size-3" />
                                    {answers.total} answer{answers.total !== 1 ? "s" : ""}
                                </span>
                                <span className="flex items-center gap-1">
                                    <ArrowUp className="size-3" />
                                    {questionVoteResult} vote{questionVoteResult !== 1 ? "s" : ""}
                                </span>
                            </div>

                            <div className="mt-6 flex gap-5">
                                {/* ── Vote column ── */}
                                <div className="flex shrink-0 flex-col items-center gap-2 pt-1">
                                    <button
                                        onClick={() => handleQuestionVote("upvoted")}
                                        className={cn(
                                            "flex size-10 items-center justify-center rounded-xl border transition duration-200",
                                            questionVotedDoc?.voteStatus === "upvoted"
                                                ? "border-[#a7c8b3]/40 bg-[#a7c8b3]/15 text-[#a7c8b3]"
                                                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                                        )}
                                    >
                                        <ArrowUp className="size-5" />
                                    </button>
                                    <span className="text-lg font-bold text-zinc-100">{questionVoteResult}</span>
                                    <button
                                        onClick={() => handleQuestionVote("downvoted")}
                                        className={cn(
                                            "flex size-10 items-center justify-center rounded-xl border transition duration-200",
                                            questionVotedDoc?.voteStatus === "downvoted"
                                                ? "border-red-400/40 bg-red-400/10 text-red-400"
                                                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:border-red-400/30 hover:text-red-400"
                                        )}
                                    >
                                        <ArrowDown className="size-5" />
                                    </button>

                                    {/* Bookmark */}
                                    <button
                                        onClick={() => setBookmarked(!bookmarked)}
                                        className={cn(
                                            "mt-1 flex size-10 items-center justify-center rounded-xl border transition",
                                            bookmarked
                                                ? "border-amber-400/30 bg-amber-400/10 text-amber-400"
                                                : "border-white/10 bg-white/[0.04] text-zinc-500 hover:text-zinc-300"
                                        )}
                                        title="Bookmark"
                                    >
                                        <Bookmark className="size-4" />
                                    </button>
                                </div>

                                {/* ── Content column ── */}
                                <div className="min-w-0 flex-1">
                                    {/* Markdown body */}
                                    <div data-color-mode="dark">
                                        <MarkdownPreview
                                            source={question.content}
                                            style={{ background: "transparent", color: "inherit", fontSize: "0.925rem", lineHeight: "1.75" }}
                                        />
                                    </div>

                                    {/* Attachment */}
                                    {attachmentUrl && attachmentUrl !== "" && (
                                        <div className="mt-5">
                                            <img
                                                src={attachmentUrl}
                                                alt="Question attachment"
                                                className="max-h-80 rounded-xl border border-white/10 object-contain"
                                            />
                                        </div>
                                    )}

                                    {/* Tags */}
                                    {question.tags?.length > 0 && (
                                        <div className="mt-5 flex flex-wrap gap-2">
                                            {question.tags.map((tag: string) => (
                                                <Link
                                                    key={tag}
                                                    href={`/questions?tag=${tag}`}
                                                    className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-400 transition hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                                                >
                                                    <Tag className="size-3" />
                                                    {tag}
                                                </Link>
                                            ))}
                                        </div>
                                    )}

                                    {/* Author card + share */}
                                    <div className="mt-6 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-5 sm:flex-row sm:items-center">
                                        {/* Share */}
                                        <button
                                            onClick={handleShareCopy}
                                            className="flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300"
                                        >
                                            {copied ? <Check className="size-3.5 text-[#a7c8b3]" /> : <Share2 className="size-3.5" />}
                                            {copied ? "Link copied!" : "Share"}
                                        </button>

                                        {/* Author */}
                                        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                                            <img
                                                src={avatars.getInitials(author.name, 32, 32).href}
                                                alt={author.name}
                                                className="size-8 rounded-lg"
                                            />
                                            <div className="text-left">
                                                <Link
                                                    href={`/users/${author.$id}/${slugify(author.name)}`}
                                                    className="block text-sm font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
                                                >
                                                    {author.name}
                                                </Link>
                                                <p className="text-xs text-zinc-600">
                                                    {author.prefs?.reputation ?? 0} reputation
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── Question Comments ── */}
                            <CommentsSection
                                comments={comments}
                                setComments={setComments}
                                type="question"
                                typeId={question.$id}
                                user={user}
                                className="mt-4"
                            />
                        </section>

                        {/* ── Answers Header ── */}
                        <div className="mt-8 flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-zinc-100">
                                {answers.total} {answers.total === 1 ? "Answer" : "Answers"}
                            </h2>
                            <button
                                onClick={() => {
                                    if (!user) { router.push("/login"); return; }
                                    setShowAnswerEditor(!showAnswerEditor);
                                }}
                                className="flex h-9 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-4 text-sm font-medium text-[#08100b] transition hover:bg-[#b4d6bf]"
                            >
                                <Plus className="size-4" />
                                Your Answer
                            </button>
                        </div>

                        {/* ── Answer Editor ── */}
                        <AnimatePresence>
                            {showAnswerEditor && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5"
                                >
                                    <h3 className="mb-3 text-sm font-semibold text-zinc-300">
                                        Write your answer — Markdown supported
                                    </h3>
                                    <div data-color-mode="dark">
                                        <MDEditor
                                            value={newAnswer}
                                            onChange={(v) => setNewAnswer(v || "")}
                                            height={280}
                                            preview="live"
                                            style={{
                                                background: "transparent",
                                                border: "1px solid rgba(255,255,255,0.1)",
                                                borderRadius: "12px",
                                                overflow: "hidden",
                                            }}
                                            textareaProps={{ placeholder: "Share your knowledge…" }}
                                        />
                                    </div>
                                    {answerError && (
                                        <p className="mt-2 text-xs text-red-400">{answerError}</p>
                                    )}
                                    <div className="mt-3 flex items-center gap-2">
                                        <Button
                                            onClick={handleSubmitAnswer}
                                            disabled={isSubmittingAnswer || !newAnswer.trim()}
                                            className="h-9 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-5 text-sm font-medium text-[#08100b] shadow-none transition hover:bg-[#b4d6bf] disabled:opacity-50"
                                        >
                                            {isSubmittingAnswer ? "Posting…" : "Post Answer"}
                                            {!isSubmittingAnswer && <Send className="size-3.5" />}
                                        </Button>
                                        <button
                                            onClick={() => setShowAnswerEditor(false)}
                                            className="h-9 rounded-xl border border-white/10 px-4 text-sm text-zinc-500 transition hover:text-zinc-300"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Answer List ── */}
                        <div className="mt-4 space-y-4">
                            {answers.documents.length === 0 ? (
                                <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] py-16 text-center">
                                    <div className="mb-3 flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                                        <MessageCircle className="size-5 text-zinc-500" />
                                    </div>
                                    <p className="text-sm font-medium text-zinc-400">No answers yet</p>
                                    <p className="mt-1 text-xs text-zinc-600">Be the first to share your knowledge!</p>
                                </div>
                            ) : (
                                answers.documents.map((answer) => (
                                    <AnswerCard
                                        key={answer.$id}
                                        answer={answer}
                                        user={user}
                                        onDelete={handleDeleteAnswer}
                                    />
                                ))
                            )}
                        </div>

                        {/* ── Bottom CTA if not logged in ── */}
                        {!user && (
                            <div className="mt-8 rounded-2xl border border-[#a7c8b3]/15 bg-[#a7c8b3]/[0.04] p-6 text-center">
                                <p className="text-sm text-zinc-400">
                                    Know the answer?{" "}
                                    <Link href="/login" className="font-medium text-[#a7c8b3] hover:text-[#b4d6bf]">
                                        Log in
                                    </Link>{" "}
                                    or{" "}
                                    <Link href="/register" className="font-medium text-[#a7c8b3] hover:text-[#b4d6bf]">
                                        sign up
                                    </Link>{" "}
                                    to answer this question.
                                </p>
                            </div>
                        )}
                    </div>
        </div>
    );
}



// ─── AnswerCard ───────────────────────────────────────────────────────────────

function AnswerCard({
    answer,
    user,
    onDelete,
}: {
    answer: AnswerDoc;
    user: Models.User<any> | null;
    onDelete: (id: string) => void;
}) {
    const router = useRouter();
    const [votedDoc, setVotedDoc] = React.useState<Models.Document | null | undefined>(undefined);
    const [voteResult, setVoteResult] = React.useState(
        answer.upvotesDocuments.total - answer.downvotesDocuments.total
    );
    const [comments, setComments] = React.useState(answer.comments);

    React.useEffect(() => {
        if (!user) return;
        databases
            .listDocuments(db, voteCollection, [
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
            const res = await fetch("/api/vote", {
                method: "POST",
                body: JSON.stringify({ votedById: user.$id, voteStatus: status, type: "answer", typeId: answer.$id }),
            });
            const data = await res.json();
            if (!res.ok) throw data;
            setVoteResult(data.data.voteResult);
            setVotedDoc(data.data.document);
        } catch (e: any) {
            alert(e?.message || "Vote failed");
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:p-6"
        >
            <div className="flex gap-4">
                {/* Vote column */}
                <div className="flex shrink-0 flex-col items-center gap-2 pt-1">
                    <button
                        onClick={() => handleVote("upvoted")}
                        className={cn(
                            "flex size-9 items-center justify-center rounded-xl border transition duration-200",
                            votedDoc?.voteStatus === "upvoted"
                                ? "border-[#a7c8b3]/40 bg-[#a7c8b3]/15 text-[#a7c8b3]"
                                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                        )}
                    >
                        <ArrowUp className="size-4" />
                    </button>
                    <span className="text-base font-bold text-zinc-100">{voteResult}</span>
                    <button
                        onClick={() => handleVote("downvoted")}
                        className={cn(
                            "flex size-9 items-center justify-center rounded-xl border transition duration-200",
                            votedDoc?.voteStatus === "downvoted"
                                ? "border-red-400/40 bg-red-400/10 text-red-400"
                                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:border-red-400/30 hover:text-red-400"
                        )}
                    >
                        <ArrowDown className="size-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                    <div data-color-mode="dark">
                        <MarkdownPreview
                            source={answer.content}
                            style={{ background: "transparent", color: "inherit", fontSize: "0.9rem", lineHeight: "1.7" }}
                        />
                    </div>

                    {/* Author + delete */}
                    <div className="mt-5 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center">
                        {/* Delete */}
                        {user?.$id === answer.authorId && (
                            <button
                                onClick={() => onDelete(answer.$id)}
                                className="flex items-center gap-1.5 text-xs text-red-400/70 transition hover:text-red-400"
                            >
                                <Trash2 className="size-3.5" />
                                Delete
                            </button>
                        )}
                        {user?.$id !== answer.authorId && <div />}

                        {/* Author */}
                        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-1.5">
                            <img
                                src={avatars.getInitials(answer.author.name, 28, 28).href}
                                alt={answer.author.name}
                                className="size-7 rounded-lg"
                            />
                            <div>
                                <Link
                                    href={`/users/${answer.author.$id}/${slugify(answer.author.name)}`}
                                    className="block text-xs font-medium text-[#a7c8b3] transition hover:text-[#b4d6bf]"
                                >
                                    {answer.author.name}
                                </Link>
                                <p className="text-[10px] text-zinc-600">
                                    {answer.author.reputation} rep · {convertDateToRelativeTime(new Date(answer.$createdAt))}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Answer comments */}
                    <CommentsSection
                        comments={comments}
                        setComments={setComments}
                        type="answer"
                        typeId={answer.$id}
                        user={user}
                        className="mt-3"
                    />
                </div>
            </div>
        </motion.div>
    );
}

// ─── CommentsSection ─────────────────────────────────────────────────────────

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

    const handlePost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !user) return;
        setIsPosting(true);
        try {
            const doc = await databases.createDocument(db, commentCollection, ID.unique(), {
                content: newComment.trim(),
                authorId: user.$id,
                type,
                typeId,
            });
            setComments((prev) => ({
                total: prev.total + 1,
                documents: [
                    { ...doc, author: { $id: user.$id, name: user.name, reputation: user.prefs?.reputation ?? 0 } } as CommentDoc,
                    ...prev.documents,
                ],
            }));
            setNewComment("");
            setShowInput(false);
            setExpanded(true);
        } catch (e: any) {
            alert(e?.message || "Failed to post comment");
        } finally {
            setIsPosting(false);
        }
    };

    const handleDelete = async (commentId: string) => {
        try {
            await databases.deleteDocument(db, commentCollection, commentId);
            setComments((prev) => ({
                total: prev.total - 1,
                documents: prev.documents.filter((c) => c.$id !== commentId),
            }));
        } catch (e: any) {
            alert(e?.message || "Failed to delete comment");
        }
    };

    const visibleComments = expanded ? comments.documents : comments.documents.slice(0, 2);

    return (
        <div className={cn("border-t border-white/[0.06] pt-3", className)}>
            {/* Existing comments */}
            {visibleComments.map((comment) => (
                <div
                    key={comment.$id}
                    className="group flex items-start gap-2 border-b border-white/[0.04] py-2 last:border-0"
                >
                    <p className="flex-1 text-xs leading-relaxed text-zinc-400">
                        {comment.content}{" "}
                        <span className="text-zinc-600">—</span>{" "}
                        <Link
                            href={`/users/${comment.authorId}/${slugify(comment.author?.name || "user")}`}
                            className="text-[#a7c8b3] hover:text-[#b4d6bf]"
                        >
                            {comment.author?.name}
                        </Link>{" "}
                        <span className="text-zinc-600">
                            {convertDateToRelativeTime(new Date(comment.$createdAt))}
                        </span>
                    </p>
                    {user?.$id === comment.authorId && (
                        <button
                            onClick={() => handleDelete(comment.$id)}
                            className="shrink-0 text-zinc-700 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                        >
                            <Trash2 className="size-3" />
                        </button>
                    )}
                </div>
            ))}

            {/* Expand/collapse */}
            {comments.total > 2 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-1 py-1.5 text-xs text-zinc-600 transition hover:text-zinc-400"
                >
                    {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    {expanded ? "Show less" : `Show ${comments.total - 2} more comment${comments.total - 2 !== 1 ? "s" : ""}`}
                </button>
            )}

            {/* Add comment */}
            {showInput ? (
                <form onSubmit={handlePost} className="mt-2 flex gap-2">
                    <input
                        autoFocus
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment…"
                        className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#a7c8b3]/40"
                        maxLength={500}
                    />
                    <button
                        type="submit"
                        disabled={isPosting || !newComment.trim()}
                        className="flex items-center gap-1 rounded-lg border border-[#a7c8b3]/20 bg-[#a7c8b3] px-3 py-1.5 text-xs font-medium text-[#08100b] transition hover:bg-[#b4d6bf] disabled:opacity-50"
                    >
                        <Send className="size-3" />
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowInput(false)}
                        className="rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-500 transition hover:text-zinc-300"
                    >
                        Cancel
                    </button>
                </form>
            ) : (
                <button
                    onClick={() => {
                        if (!user) { router.push("/login"); return; }
                        setShowInput(true);
                    }}
                    className="mt-1 text-xs text-zinc-600 transition hover:text-zinc-400"
                >
                    + Add comment
                </button>
            )}
        </div>
    );
}
