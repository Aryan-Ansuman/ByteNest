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
    ChevronRight,
    Lightbulb,
    Eye,
    FileText,
    Sparkles,
    Info,
} from "lucide-react";
import { ID, Permission, Role } from "appwrite";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/Auth";
import { databases, storage } from "@/models/client/config";
import { db, questionAttachmentBucket, questionCollection } from "@/models/name";
import slugify from "@/utils/slugify";
import { apiFetch } from "@/lib/api-fetch";
import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

// ─── Lazy-load the markdown editor (SSR incompatible) ─────────────────────────
const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });
import MarkdownPreview from "@/components/MarkdownPreview";

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = "title" | "body" | "tags" | "image" | "preview";

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: "title", label: "Title", icon: <FileText className="size-4" /> },
    { id: "body", label: "Body", icon: <Sparkles className="size-4" /> },
    { id: "tags", label: "Tags", icon: <Tag className="size-4" /> },
    { id: "image", label: "Image", icon: <ImageIcon className="size-4" /> },
    { id: "preview", label: "Preview", icon: <Eye className="size-4" /> },
];

// ─── Popular tag suggestions ───────────────────────────────────────────────────
const TAG_SUGGESTIONS = [
    "javascript", "typescript", "react", "next.js", "node.js",
    "python", "css", "tailwindcss", "sql", "mongodb",
    "docker", "git", "api", "authentication", "performance",
    "testing", "deployment", "prisma", "graphql", "websocket",
];



// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AskQuestionPage() {
    const { user } = useAuthStore();
    const router = useRouter();

    // form state
    const [title, setTitle] = React.useState("");
    const [content, setContent] = React.useState("");
    const [tags, setTags] = React.useState<string[]>([]);
    const [tagInput, setTagInput] = React.useState("");
    const [attachment, setAttachment] = React.useState<File | null>(null);
    const [imagePreview, setImagePreview] = React.useState<string | null>(null);

    // ui state
    const [activeStep, setActiveStep] = React.useState<Step>("title");
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState("");
    const [success, setSuccess] = React.useState(false);
    const [tagError, setTagError] = React.useState("");
    const [titleSuggestions] = React.useState<string[]>([]);
    const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([]);

    // Redirect if not logged in
    React.useEffect(() => {
        if (!user) router.push("/login");
    }, [user, router]);

    // Title character count progress
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

    // tag suggestions filter
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
        if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            addTag(tagInput);
        }
        if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { setError("Image must be under 5MB"); return; }
        setAttachment(file);
        const reader = new FileReader();
        reader.onloadend = () => setImagePreview(reader.result as string);
        reader.readAsDataURL(file);
        setError("");
    };

    const removeImage = () => {
        setAttachment(null);
        setImagePreview(null);
    };

    const validateStep = (step: Step): string => {
        if (step === "title" && title.trim().length < 15) return "Title must be at least 15 characters";
        if (step === "body" && content.trim().length < 30) return "Body must be at least 30 characters";
        if (step === "tags" && tags.length === 0) return "Add at least one tag";
        return "";
    };

    const goToStep = (step: Step) => {
        const idx = STEPS.findIndex((s) => s.id === activeStep);
        const targetIdx = STEPS.findIndex((s) => s.id === step);
        if (targetIdx > idx) {
            const err = validateStep(activeStep);
            if (err) { setError(err); return; }
        }
        setError("");
        setActiveStep(step);
    };

    const nextStep = () => {
        const idx = STEPS.findIndex((s) => s.id === activeStep);
        if (idx < STEPS.length - 1) goToStep(STEPS[idx + 1].id);
    };

    const isStepComplete = (step: Step): boolean => {
        if (step === "title") return title.trim().length >= 15;
        if (step === "body") return content.trim().length >= 30;
        if (step === "tags") return tags.length > 0;
        return true;
    };

    const handleSubmit = async () => {
        if (!user) return;
        const titleErr = validateStep("title");
        const bodyErr = validateStep("body");
        const tagsErr = validateStep("tags");
        if (titleErr || bodyErr || tagsErr) {
            setError(titleErr || bodyErr || tagsErr);
            return;
        }

        setIsSubmitting(true);
        setError("");
        let uploadedAttachmentId: string | null = null;

        try {
            const docData: any = {
                title: title.trim(),
                content: content.trim(),
                authorId: user.$id,
                tags,
            };

            if (attachment) {
                const stored = await storage.createFile(
                    questionAttachmentBucket,
                    ID.unique(),
                    attachment
                );
                docData.attachmentId = stored.$id;
                uploadedAttachmentId = stored.$id;
            }

            const doc = await apiFetch("/api/question", {
                method: "POST",
                body: JSON.stringify(docData),
            });

            setSuccess(true);
            setTimeout(() => {
                router.push(`/questions/${doc.$id}/${slugify(title)}`);
            }, 1200);
        } catch (err: any) {
            if (uploadedAttachmentId) {
                await storage
                    .deleteFile(questionAttachmentBucket, uploadedAttachmentId)
                    .catch(() => undefined);
            }
            setError(err?.message || "Something went wrong. Please try again.");
            setIsSubmitting(false);
        }
    };

    if (!user) return null;

    return (
        <div className="w-full">
            <div className="mx-auto max-w-3xl">
                        {/* ── Page Header ── */}
                        <div className="mb-8">
                            <Link
                                href="/questions"
                                className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-300"
                            >
                                <ArrowLeft className="size-4" />
                                Back to questions
                            </Link>
                            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                                Ask a question
                            </h1>
                            <p className="mt-1.5 text-sm text-zinc-500">
                                Get answers from the ByteNest community. Be specific and clear.
                            </p>
                        </div>

                        {/* ── Step Progress ── */}
                        <StepProgress
                            steps={STEPS}
                            activeStep={activeStep}
                            isStepComplete={isStepComplete}
                            onStepClick={goToStep}
                        />

                        {/* ── Error Banner ── */}
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

                        {/* ── Success Banner ── */}
                        <AnimatePresence>
                            {success && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.96 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
                                >
                                    <CheckCircle2 className="size-4 shrink-0" />
                                    Question posted! Redirecting…
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* ── Step Panels ── */}
                        <div className="mt-4 space-y-4">
                            <AnimatePresence mode="wait">
                                {activeStep === "title" && (
                                    <StepPanel key="title">
                                        <StepHeader
                                            icon={<FileText className="size-5" />}
                                            title="Write a clear title"
                                            description="Imagine you're asking a colleague — be specific about the problem."
                                        />
                                        <div className="mt-5">
                                            <Input
                                                autoFocus
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                placeholder="e.g. How do I debounce a search input in React with hooks?"
                                                maxLength={100}
                                                className="h-12 rounded-xl border-white/10 bg-white/[0.04] text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") nextStep();
                                                }}
                                            />
                                            {/* Quality indicator */}
                                            <div className="mt-3 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-1.5 w-40 overflow-hidden rounded-full bg-white/10">
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
                                                </div>
                                                <span className="text-xs text-zinc-600">
                                                    {title.length}/100
                                                </span>
                                            </div>

                                            {/* Hints */}
                                            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4">
                                                <p className="mb-2 flex items-center gap-2 text-xs font-medium text-zinc-500">
                                                    <Info className="size-3.5" /> Good title examples
                                                </p>
                                                <ul className="space-y-1.5 text-xs text-zinc-600">
                                                    <li>✓ TypeError: Cannot read property of undefined in useEffect cleanup</li>
                                                    <li>✓ How to persist Zustand state to localStorage in Next.js?</li>
                                                    <li>✗ Help!! My code doesn&apos;t work</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </StepPanel>
                                )}

                                {activeStep === "body" && (
                                    <StepPanel key="body">
                                        <StepHeader
                                            icon={<Sparkles className="size-5" />}
                                            title="Describe your problem"
                                            description="Include what you've tried, what you expected, and what actually happened. Markdown & code supported."
                                        />
                                        <div className="mt-5" data-color-mode="dark">
                                            <MDEditor
                                                value={content}
                                                onChange={(v) => setContent(v || "")}
                                                height={360}
                                                preview="live"
                                                style={{
                                                    background: "transparent",
                                                    border: "1px solid rgba(255,255,255,0.1)",
                                                    borderRadius: "12px",
                                                    overflow: "hidden",
                                                }}
                                                textareaProps={{
                                                    placeholder: "Explain the problem clearly...\n\nPaste any relevant code here...",
                                                }}
                                            />
                                            <div className="mt-2 flex justify-between text-xs text-zinc-600">
                                                <span>{content.length} characters</span>
                                                {content.length < 30 && (
                                                    <span className="text-amber-500/80">
                                                        {30 - content.length} more chars needed
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </StepPanel>
                                )}

                                {activeStep === "tags" && (
                                    <StepPanel key="tags">
                                        <StepHeader
                                            icon={<Tag className="size-5" />}
                                            title="Add tags"
                                            description="Add up to 5 tags to describe what your question is about. Helps experts find it."
                                        />
                                        <div className="mt-5">
                                            {/* Tag input */}
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

                                                {/* Autocomplete dropdown */}
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

                                            {tagError && (
                                                <p className="mt-2 text-xs text-red-400">{tagError}</p>
                                            )}

                                            {/* Popular tags */}
                                            <div className="mt-4">
                                                <p className="mb-2.5 text-xs text-zinc-600">Popular tags</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {TAG_SUGGESTIONS.filter((t) => !tags.includes(t)).slice(0, 12).map((tag) => (
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

                                            <p className="mt-3 text-xs text-zinc-600">
                                                {tags.length}/5 tags added
                                            </p>
                                        </div>
                                    </StepPanel>
                                )}

                                {activeStep === "image" && (
                                    <StepPanel key="image">
                                        <StepHeader
                                            icon={<ImageIcon className="size-5" />}
                                            title="Attach an image"
                                            description="Optional — upload a screenshot or diagram to make your question clearer."
                                        />
                                        <div className="mt-5">
                                            {imagePreview ? (
                                                <div className="relative overflow-hidden rounded-xl border border-white/10">
                                                    <img
                                                        src={imagePreview}
                                                        alt="Preview"
                                                        className="max-h-64 w-full object-contain bg-black/40"
                                                    />
                                                    <button
                                                        onClick={removeImage}
                                                        className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border border-white/20 bg-black/60 text-zinc-300 backdrop-blur-sm transition hover:bg-red-500/20 hover:text-red-400"
                                                    >
                                                        <X className="size-4" />
                                                    </button>
                                                    <div className="border-t border-white/10 bg-black/30 px-4 py-2 text-xs text-zinc-500">
                                                        {attachment?.name} · {((attachment?.size || 0) / 1024).toFixed(0)} KB
                                                    </div>
                                                </div>
                                            ) : (
                                                <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/20 bg-white/[0.025] px-6 py-14 text-center transition hover:border-[#a7c8b3]/40 hover:bg-white/[0.04]">
                                                    <div className="flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05]">
                                                        <ImageIcon className="size-5 text-zinc-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-zinc-300">
                                                            Click to upload an image
                                                        </p>
                                                        <p className="mt-1 text-xs text-zinc-600">
                                                            PNG, JPG, GIF, WebP · Max 5MB
                                                        </p>
                                                    </div>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handleImageChange}
                                                        className="hidden"
                                                    />
                                                </label>
                                            )}

                                            <p className="mt-3 text-xs text-zinc-600">
                                                This step is optional — skip to Preview if you don&apos;t need an image.
                                            </p>
                                        </div>
                                    </StepPanel>
                                )}

                                {activeStep === "preview" && (
                                    <StepPanel key="preview">
                                        <StepHeader
                                            icon={<Eye className="size-5" />}
                                            title="Review your question"
                                            description="Make sure everything looks right before posting."
                                        />
                                        <div className="mt-5 space-y-5">
                                            {/* Title preview */}
                                            <PreviewBlock label="Title">
                                                {title || <span className="text-zinc-600 italic">No title</span>}
                                            </PreviewBlock>

                                            {/* Body preview */}
                                            <PreviewBlock label="Body">
                                                {content ? (
                                                    <div data-color-mode="dark" className="prose-sm">
                                                        <MarkdownPreview
                                                            source={content}
                                                            style={{ background: "transparent", color: "inherit" }}
                                                        />
                                                    </div>
                                                ) : (
                                                    <span className="text-zinc-600 italic">No body</span>
                                                )}
                                            </PreviewBlock>

                                            {/* Tags preview */}
                                            <PreviewBlock label="Tags">
                                                {tags.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {tags.map((tag) => (
                                                            <span
                                                                key={tag}
                                                                className="rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-2.5 py-1 text-xs font-medium text-[#a7c8b3]"
                                                            >
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-zinc-600 italic">No tags</span>
                                                )}
                                            </PreviewBlock>

                                            {/* Image preview */}
                                            {imagePreview && (
                                                <PreviewBlock label="Attachment">
                                                    <img
                                                        src={imagePreview}
                                                        alt="Attachment"
                                                        className="max-h-40 rounded-lg object-contain"
                                                    />
                                                </PreviewBlock>
                                            )}

                                            {/* Checklist */}
                                            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                                                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                                                    Checklist
                                                </p>
                                                <ul className="space-y-2">
                                                    {[
                                                        { label: "Title is descriptive (15+ chars)", ok: title.length >= 15 },
                                                        { label: "Body explains the problem (30+ chars)", ok: content.length >= 30 },
                                                        { label: "At least one tag added", ok: tags.length > 0 },
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
                                        </div>
                                    </StepPanel>
                                )}
                            </AnimatePresence>

                            {/* ── Action Row ── */}
                            <div className="flex items-center justify-between pt-2">
                                <button
                                    onClick={() => {
                                        const idx = STEPS.findIndex((s) => s.id === activeStep);
                                        if (idx > 0) { setError(""); setActiveStep(STEPS[idx - 1].id); }
                                    }}
                                    disabled={activeStep === "title"}
                                    className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30"
                                >
                                    <ArrowLeft className="size-4" />
                                    Back
                                </button>

                                {activeStep !== "preview" ? (
                                    <Button
                                        onClick={nextStep}
                                        className="h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-5 text-sm font-medium text-[#08100b] shadow-none transition hover:bg-[#b4d6bf]"
                                    >
                                        Continue
                                        <ChevronRight className="size-4" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleSubmit}
                                        disabled={isSubmitting || success}
                                        className="h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-6 text-sm font-semibold text-[#08100b] shadow-none transition hover:bg-[#b4d6bf] disabled:opacity-60"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <span className="animate-spin">⟳</span>
                                                Posting…
                                            </>
                                        ) : (
                                            "Post Question"
                                        )}
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
        </div>
    );
}
// ─── Sub-components ───────────────────────────────────────────────────────────


function StepProgress({
    steps,
    activeStep,
    isStepComplete,
    onStepClick,
}: {
    steps: typeof STEPS;
    activeStep: Step;
    isStepComplete: (s: Step) => boolean;
    onStepClick: (s: Step) => void;
}) {
    const activeIdx = steps.findIndex((s) => s.id === activeStep);

    return (
        <div className="mb-6 flex items-center gap-0">
            {steps.map((step, idx) => {
                const isActive = step.id === activeStep;
                const isComplete = isStepComplete(step.id) && idx < activeIdx;
                const isPast = idx < activeIdx;

                return (
                    <React.Fragment key={step.id}>
                        <button
                            onClick={() => onStepClick(step.id)}
                            className={cn(
                                "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                                isActive
                                    ? "bg-[#a7c8b3]/15 text-[#a7c8b3]"
                                    : isPast
                                    ? "text-zinc-400 hover:text-zinc-200"
                                    : "text-zinc-600 hover:text-zinc-500"
                            )}
                        >
                            <span
                                className={cn(
                                    "flex size-6 items-center justify-center rounded-full text-[10px] font-bold transition",
                                    isActive
                                        ? "bg-[#a7c8b3] text-[#08100b]"
                                        : isPast
                                        ? "bg-zinc-700 text-zinc-200"
                                        : "bg-white/10 text-zinc-500"
                                )}
                            >
                                {isComplete ? <CheckCircle2 className="size-3" /> : idx + 1}
                            </span>
                            <span className="hidden sm:inline">{step.label}</span>
                        </button>
                        {idx < steps.length - 1 && (
                            <div className="h-px w-4 flex-1 bg-white/5 sm:w-8 sm:flex-none" />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

function StepPanel({ children }: { children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-xl"
        >
            {children}
        </motion.div>
    );
}

function StepHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return (
        <div>
            <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 text-[#a7c8b3]">
                    {icon}
                </div>
                <h2 className="text-xl font-semibold text-zinc-100">{title}</h2>
            </div>
            <p className="mt-2 text-sm text-zinc-500">{description}</p>
        </div>
    );
}

function PreviewBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                {label}
            </p>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-zinc-300">
                {children}
            </div>
        </div>
    );
}
