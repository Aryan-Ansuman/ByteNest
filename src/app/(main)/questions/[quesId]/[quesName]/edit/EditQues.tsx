"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Plus,
    Bookmark,
    HomeIcon,
    Tags,
    UserRound,
    ArrowLeft,
    Tag,
    X,
    ImageIcon,
    AlertCircle,
    CheckCircle2,
    Eye,
    FileText,
    Sparkles,
    Info,
    Save,
    Loader2,
    Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/Auth";
import { storage } from "@/models/client/config";
import { questionAttachmentBucket } from "@/models/name";
import slugify from "@/utils/slugify";
import { apiFetch } from "@/lib/api-fetch";
import { Models, ID } from "appwrite";
import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });
const MarkdownPreview = dynamic(
    () => import("@uiw/react-md-editor").then((m) => m.default.Markdown),
    { ssr: false }
);

// ─── Constants ────────────────────────────────────────────────────────────────

const TAG_SUGGESTIONS = [
    "javascript", "typescript", "react", "next.js", "node.js",
    "python", "css", "tailwindcss", "sql", "mongodb",
    "docker", "git", "api", "authentication", "performance",
    "testing", "deployment", "prisma", "graphql", "websocket",
];



type ActiveTab = "edit" | "preview";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
    question: Models.Document;
    existingAttachmentUrl: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EditQues({ question, existingAttachmentUrl }: Props) {
    const { user } = useAuthStore();
    const router = useRouter();

    // Redirect if not the author
    React.useEffect(() => {
        if (user && user.$id !== question.authorId) {
            router.push(`/questions/${question.$id}/${slugify(question.title)}`);
        }
        if (!user) {
            router.push("/login");
        }
    }, [user, question, router]);

    // ── Form state ──────────────────────────────────────────────────────────
    const [title, setTitle] = React.useState(question.title as string);
    const [content, setContent] = React.useState(question.content as string);
    const [tags, setTags] = React.useState<string[]>((question.tags as string[]) || []);
    const [tagInput, setTagInput] = React.useState("");
    const [tagError, setTagError] = React.useState("");
    const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([]);

    // Attachment state
    const [newAttachment, setNewAttachment] = React.useState<File | null>(null);
    const [newImagePreview, setNewImagePreview] = React.useState<string | null>(null);
    const [removeExistingImage, setRemoveExistingImage] = React.useState(false);

    // UI state
    const [activeTab, setActiveTab] = React.useState<ActiveTab>("edit");
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState("");
    const [success, setSuccess] = React.useState(false);

    // Track what changed for the change summary
    const originalTitle = React.useRef(question.title as string);
    const originalContent = React.useRef(question.content as string);
    const originalTags = React.useRef<string[]>((question.tags as string[]) || []);

    const hasChanges = React.useMemo(() => {
        return (
            title !== originalTitle.current ||
            content !== originalContent.current ||
            JSON.stringify(tags) !== JSON.stringify(originalTags.current) ||
            newAttachment !== null ||
            removeExistingImage
        );
    }, [title, content, tags, newAttachment, removeExistingImage]);

    const changedFields = React.useMemo(() => {
        const fields: string[] = [];
        if (title !== originalTitle.current) fields.push("title");
        if (content !== originalContent.current) fields.push("body");
        if (JSON.stringify(tags) !== JSON.stringify(originalTags.current)) fields.push("tags");
        if (newAttachment) fields.push("image (new)");
        if (removeExistingImage) fields.push("image (removed)");
        return fields;
    }, [title, content, tags, newAttachment, removeExistingImage]);

    // ── Tag logic ────────────────────────────────────────────────────────────
    React.useEffect(() => {
        if (tagInput.length > 0) {
            setFilteredSuggestions(
                TAG_SUGGESTIONS.filter(
                    (t) => t.includes(tagInput.toLowerCase()) && !tags.includes(t)
                ).slice(0, 6)
            );
        } else {
            setFilteredSuggestions([]);
        }
    }, [tagInput, tags]);

    const addTag = (tag: string) => {
        const cleaned = tag.toLowerCase().trim().replace(/\s+/g, "-");
        if (!cleaned) return;
        if (tags.length >= 5) { setTagError("Maximum 5 tags allowed"); return; }
        if (cleaned.length > 25) { setTagError("Tag too long (max 25 chars)"); return; }
        if (tags.includes(cleaned)) { setTagError("Tag already added"); return; }
        setTags((prev) => [...prev, cleaned]);
        setTagInput("");
        setTagError("");
        setFilteredSuggestions([]);
    };

    const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
        if (e.key === "Backspace" && tagInput === "" && tags.length > 0) removeTag(tags[tags.length - 1]);
    };

    // ── Image logic ──────────────────────────────────────────────────────────
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB"); return; }
        setNewAttachment(file);
        setRemoveExistingImage(false);
        const reader = new FileReader();
        reader.onloadend = () => setNewImagePreview(reader.result as string);
        reader.readAsDataURL(file);
        setError("");
    };

    const handleRemoveNewImage = () => {
        setNewAttachment(null);
        setNewImagePreview(null);
    };

    const handleRemoveExistingImage = () => {
        setRemoveExistingImage(true);
    };

    const handleRestoreExistingImage = () => {
        setRemoveExistingImage(false);
    };

    // ── Validation ───────────────────────────────────────────────────────────
    const validate = (): string => {
        if (title.trim().length < 15) return "Title must be at least 15 characters";
        if (content.trim().length < 30) return "Body must be at least 30 characters";
        if (tags.length === 0) return "Add at least one tag";
        return "";
    };

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!user) return;

        const validationError = validate();
        if (validationError) { setError(validationError); return; }
        if (!hasChanges) { setError("No changes detected"); return; }

        setIsSubmitting(true);
        setError("");

        try {
            let newAttachmentId: string | undefined;

            // Upload new image if provided
            if (newAttachment) {
                const stored = await storage.createFile(
                    questionAttachmentBucket,
                    ID.unique(),
                    newAttachment
                );
                newAttachmentId = stored.$id;
            }

            const payload: any = {
                questionId: question.$id,
                title: title.trim(),
                content: content.trim(),
                tags,
            };

            // Handle attachment changes
            if (newAttachmentId) {
                payload.attachmentId = newAttachmentId;
                payload.oldAttachmentId = question.attachmentId || null;
            } else if (removeExistingImage && question.attachmentId) {
                // Signal to API to remove the attachment
                payload.attachmentId = "none";
                payload.oldAttachmentId = question.attachmentId;
            }

            const data = await apiFetch("/api/question", {
                method: "PATCH",
                body: JSON.stringify(payload),
            });

            setSuccess(true);
            setTimeout(() => {
                router.push(`/questions/${question.$id}/${slugify(title.trim())}`);
            }, 1200);
        } catch (err: any) {
            setError(err?.message || "Something went wrong. Please try again.");
            setIsSubmitting(false);
        }
    };

    if (!user || user.$id !== question.authorId) return null;

    // ── Computed ─────────────────────────────────────────────────────────────
    const titleProgress = Math.min((title.length / 100) * 100, 100);
    const titleQuality =
        title.length < 15 ? "too short" :
        title.length < 30 ? "okay" :
        title.length < 60 ? "good" :
        title.length < 100 ? "great" : "too long";
    const titleQualityColor =
        titleQuality === "too short" ? "text-zinc-500" :
        titleQuality === "okay" ? "text-amber-400" :
        titleQuality === "good" ? "text-[#a7c8b3]" :
        titleQuality === "great" ? "text-emerald-400" : "text-red-400";

    return (
        <div className="w-full">
            <div className="mx-auto max-w-3xl">

                        {/* ── Header ── */}
                        <div className="mb-8">
                            <Link
                                href={`/questions/${question.$id}/${slugify(question.title)}`}
                                className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-300"
                            >
                                <ArrowLeft className="size-4" />
                                Back to question
                            </Link>
                            <div className="mt-2 flex items-start justify-between gap-4">
                                <div>
                                    <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                                        Edit question
                                    </h1>
                                    <p className="mt-1.5 text-sm text-zinc-500">
                                        Make your question clearer or add missing details.
                                    </p>
                                </div>
                                {hasChanges && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="shrink-0 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400"
                                    >
                                        Unsaved changes
                                    </motion.div>
                                )}
                            </div>
                        </div>

                        {/* ── Banners ── */}
                        <AnimatePresence>
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -8 }}
                                    className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                                >
                                    <AlertCircle className="size-4 shrink-0" />
                                    {error}
                                    <button onClick={() => setError("")} className="ml-auto">
                                        <X className="size-4" />
                                    </button>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <AnimatePresence>
                            {success && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
                                >
                                    <CheckCircle2 className="size-4 shrink-0" />
                                    Question updated! Redirecting…
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Form sections ── */}
                        <div className="space-y-4">

                            {/* ── Title section ── */}
                            <SectionCard
                                icon={<FileText className="size-5" />}
                                title="Title"
                                description="A clear, specific title helps others find and understand your question."
                            >
                                <div className="mt-4">
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        placeholder="e.g. How do I debounce a search input in React with hooks?"
                                        maxLength={100}
                                        className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                    />
                                    <div className="mt-2.5 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
                                                <motion.div
                                                    className={cn(
                                                        "h-full rounded-full transition-all",
                                                        titleQuality === "too short" ? "bg-zinc-600" :
                                                        titleQuality === "okay" ? "bg-amber-400" :
                                                        titleQuality === "good" ? "bg-[#a7c8b3]" :
                                                        titleQuality === "great" ? "bg-emerald-400" : "bg-red-400"
                                                    )}
                                                    style={{ width: `${titleProgress}%` }}
                                                />
                                            </div>
                                            <span className={cn("text-xs font-medium capitalize", titleQualityColor)}>
                                                {titleQuality}
                                            </span>
                                            {title !== originalTitle.current && (
                                                <span className="text-xs text-amber-400/70">· modified</span>
                                            )}
                                        </div>
                                        <span className="text-xs text-zinc-600">{title.length}/100</span>
                                    </div>
                                </div>
                            </SectionCard>

                            {/* ── Body section ── */}
                            <SectionCard
                                icon={<Sparkles className="size-5" />}
                                title="Body"
                                description="Describe your problem clearly. Include what you tried and what you expected."
                                badge={content !== originalContent.current ? "modified" : undefined}
                            >
                                {/* Tab switcher */}
                                <div className="mt-4">
                                    <div className="mb-3 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                                        {(["edit", "preview"] as ActiveTab[]).map((tab) => (
                                            <button
                                                key={tab}
                                                onClick={() => setActiveTab(tab)}
                                                className={cn(
                                                    "relative flex h-8 items-center gap-2 rounded-lg px-3 text-sm transition duration-200",
                                                    activeTab === tab
                                                        ? "text-zinc-950"
                                                        : "text-zinc-500 hover:text-zinc-300"
                                                )}
                                            >
                                                {activeTab === tab && (
                                                    <motion.span
                                                        layoutId="edit-tab"
                                                        className="absolute inset-0 rounded-lg bg-[#a7c8b3]"
                                                        transition={{ duration: 0.18, ease: "easeOut" }}
                                                    />
                                                )}
                                                {tab === "edit" ? (
                                                    <FileText className="relative size-3.5" />
                                                ) : (
                                                    <Eye className="relative size-3.5" />
                                                )}
                                                <span className="relative capitalize">{tab}</span>
                                            </button>
                                        ))}
                                    </div>

                                    {activeTab === "edit" ? (
                                        <div data-color-mode="dark">
                                            <MDEditor
                                                value={content}
                                                onChange={(v) => setContent(v || "")}
                                                height={360}
                                                preview="edit"
                                                style={{
                                                    background: "transparent",
                                                    border: "1px solid rgba(255,255,255,0.1)",
                                                    borderRadius: "12px",
                                                    overflow: "hidden",
                                                }}
                                                textareaProps={{ placeholder: "Describe your problem..." }}
                                            />
                                        </div>
                                    ) : (
                                        <div
                                            data-color-mode="dark"
                                            className="min-h-[200px] rounded-xl border border-white/10 bg-white/[0.02] p-4"
                                        >
                                            {content ? (
                                                <MarkdownPreview
                                                    source={content}
                                                    style={{
                                                        background: "transparent",
                                                        color: "inherit",
                                                        fontSize: "0.9rem",
                                                        lineHeight: "1.75",
                                                    }}
                                                />
                                            ) : (
                                                <p className="text-sm text-zinc-600 italic">Nothing to preview yet…</p>
                                            )}
                                        </div>
                                    )}

                                    <div className="mt-2 flex justify-between text-xs text-zinc-600">
                                        <span>{content.length} characters</span>
                                        {content.length < 30 && (
                                            <span className="text-amber-500/80">
                                                {30 - content.length} more chars needed
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </SectionCard>

                            {/* ── Tags section ── */}
                            <SectionCard
                                icon={<Tag className="size-5" />}
                                title="Tags"
                                description="Update tags to better describe what your question is about."
                                badge={
                                    JSON.stringify(tags) !== JSON.stringify(originalTags.current)
                                        ? "modified"
                                        : undefined
                                }
                            >
                                <div className="mt-4">
                                    <div className="relative">
                                        <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 focus-within:border-[#a7c8b3]/60 focus-within:ring-2 focus-within:ring-[#a7c8b3]/15">
                                            {tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="flex items-center gap-1 rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-2.5 py-1 text-xs font-medium text-[#a7c8b3]"
                                                >
                                                    {tag}
                                                    <button
                                                        onClick={() => removeTag(tag)}
                                                        className="rounded-full text-[#a7c8b3]/60 transition hover:text-[#a7c8b3]"
                                                    >
                                                        <X className="size-3" />
                                                    </button>
                                                </span>
                                            ))}
                                            {tags.length < 5 && (
                                                <input
                                                    value={tagInput}
                                                    onChange={(e) => setTagInput(e.target.value)}
                                                    onKeyDown={handleTagKeyDown}
                                                    placeholder={tags.length === 0 ? "Type a tag and press Enter…" : "Add another…"}
                                                    className="min-w-24 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
                                                />
                                            )}
                                        </div>

                                        {/* Autocomplete */}
                                        <AnimatePresence>
                                            {filteredSuggestions.length > 0 && (
                                                <motion.div
                                                    initial={{ opacity: 0, y: 4 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, y: 4 }}
                                                    className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-2xl"
                                                >
                                                    {filteredSuggestions.map((s) => (
                                                        <button
                                                            key={s}
                                                            onClick={() => addTag(s)}
                                                            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100"
                                                        >
                                                            <Tag className="size-3.5 text-[#a7c8b3]/60" />
                                                            {s}
                                                        </button>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    {tagError && <p className="mt-2 text-xs text-red-400">{tagError}</p>}

                                    {/* Popular tags */}
                                    <div className="mt-4">
                                        <p className="mb-2.5 text-xs text-zinc-600">Suggested tags</p>
                                        <div className="flex flex-wrap gap-2">
                                            {TAG_SUGGESTIONS.filter((t) => !tags.includes(t))
                                                .slice(0, 10)
                                                .map((tag) => (
                                                    <button
                                                        key={tag}
                                                        onClick={() => addTag(tag)}
                                                        className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-zinc-500 transition hover:border-[#a7c8b3]/30 hover:bg-[#a7c8b3]/10 hover:text-[#a7c8b3]"
                                                    >
                                                        {tag}
                                                    </button>
                                                ))}
                                        </div>
                                    </div>

                                    <p className="mt-2 text-xs text-zinc-600">{tags.length}/5 tags</p>
                                </div>
                            </SectionCard>

                            {/* ── Image section ── */}
                            <SectionCard
                                icon={<ImageIcon className="size-5" />}
                                title="Attachment"
                                description="Optional — update or remove the image attached to this question."
                                badge={
                                    newAttachment
                                        ? "new image"
                                        : removeExistingImage
                                        ? "removing"
                                        : undefined
                                }
                                badgeColor={removeExistingImage ? "red" : undefined}
                            >
                                <div className="mt-4 space-y-3">
                                    {/* New image preview */}
                                    {newImagePreview && (
                                        <div className="relative overflow-hidden rounded-xl border border-[#a7c8b3]/20">
                                            <div className="absolute left-2 top-2 z-10 rounded-lg border border-[#a7c8b3]/30 bg-[#a7c8b3]/20 px-2 py-1 text-[10px] font-medium text-[#a7c8b3]">
                                                New image
                                            </div>
                                            <img
                                                src={newImagePreview}
                                                alt="New attachment"
                                                className="max-h-56 w-full bg-black/40 object-contain"
                                            />
                                            <button
                                                onClick={handleRemoveNewImage}
                                                className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-zinc-300 backdrop-blur-sm transition hover:bg-red-500/20 hover:text-red-400"
                                            >
                                                <X className="size-3.5" />
                                            </button>
                                            <div className="border-t border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-zinc-500">
                                                {newAttachment?.name} · {((newAttachment?.size || 0) / 1024).toFixed(0)} KB
                                            </div>
                                        </div>
                                    )}

                                    {/* Existing image */}
                                    {existingAttachmentUrl && !newImagePreview && (
                                        <div
                                            className={cn(
                                                "relative overflow-hidden rounded-xl border transition",
                                                removeExistingImage
                                                    ? "border-red-500/30 opacity-40 grayscale"
                                                    : "border-white/10"
                                            )}
                                        >
                                            <div className="absolute left-2 top-2 z-10 rounded-lg border border-white/20 bg-black/60 px-2 py-1 text-[10px] font-medium text-zinc-400 backdrop-blur-sm">
                                                {removeExistingImage ? "Will be removed" : "Current image"}
                                            </div>
                                            <img
                                                src={existingAttachmentUrl}
                                                alt="Current attachment"
                                                className="max-h-56 w-full bg-black/40 object-contain"
                                            />
                                            <div className="flex items-center gap-2 border-t border-white/10 bg-black/30 px-3 py-2">
                                                {removeExistingImage ? (
                                                    <button
                                                        onClick={handleRestoreExistingImage}
                                                        className="flex items-center gap-1.5 text-xs text-[#a7c8b3] transition hover:text-[#b4d6bf]"
                                                    >
                                                        <CheckCircle2 className="size-3.5" />
                                                        Restore image
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={handleRemoveExistingImage}
                                                        className="flex items-center gap-1.5 text-xs text-red-400/70 transition hover:text-red-400"
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                        Remove image
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Upload button */}
                                    {!newImagePreview && (
                                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-3 transition hover:border-[#a7c8b3]/30 hover:bg-white/[0.04]">
                                            <div className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                                                <ImageIcon className="size-4 text-zinc-500" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-zinc-300">
                                                    {existingAttachmentUrl && !removeExistingImage
                                                        ? "Replace with a different image"
                                                        : "Upload an image"}
                                                </p>
                                                <p className="text-xs text-zinc-600">PNG, JPG, GIF, WebP · Max 5MB</p>
                                            </div>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageChange}
                                                className="hidden"
                                            />
                                        </label>
                                    )}
                                </div>
                            </SectionCard>

                            {/* ── Diff / checklist ── */}
                            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-5">
                                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                                    Validation checklist
                                </p>
                                <ul className="space-y-2">
                                    {[
                                        { label: "Title is descriptive (15+ chars)", ok: title.length >= 15 },
                                        { label: "Body explains the problem (30+ chars)", ok: content.length >= 30 },
                                        { label: "At least one tag added", ok: tags.length > 0 },
                                        { label: "Changes detected", ok: hasChanges },
                                    ].map((item) => (
                                        <li key={item.label} className="flex items-center gap-2.5 text-sm">
                                            {item.ok ? (
                                                <CheckCircle2 className="size-4 text-emerald-400" />
                                            ) : (
                                                <AlertCircle className="size-4 text-amber-400" />
                                            )}
                                            <span className={item.ok ? "text-zinc-300" : "text-zinc-500"}>
                                                {item.label}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            {/* ── Action buttons ── */}
                            <div className="flex items-center justify-between gap-4 pt-2">
                                <Link
                                    href={`/questions/${question.$id}/${slugify(question.title)}`}
                                    className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                                >
                                    <ArrowLeft className="size-4" />
                                    Discard changes
                                </Link>

                                <Button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || success || !hasChanges}
                                    className="h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-6 text-sm font-semibold text-[#08100b] shadow-none transition hover:bg-[#b4d6bf] disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <>
                                            <Loader2 className="size-4 animate-spin" />
                                            Saving…
                                        </>
                                    ) : success ? (
                                        <>
                                            <CheckCircle2 className="size-4" />
                                            Saved!
                                        </>
                                    ) : (
                                        <>
                                            <Save className="size-4" />
                                            Save changes
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
        </div>
    );
}


function SectionCard({ icon, title, description, badge, badgeColor, children }: { icon: React.ReactNode, title: string, description: string, badge?: string, badgeColor?: "red" | "amber", children: React.ReactNode }) {
    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-5 md:p-6">
            <div className="flex items-center gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400">
                    {icon}
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
                        {badge && (
                            <span className={cn(
                                "rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                                badgeColor === "red" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
                            )}>
                                {badge}
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-zinc-500">{description}</p>
                </div>
            </div>
            {children}
        </section>
    );
}
