"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft,
    ChevronRight,
    Github,
    Link2,
    AlertCircle,
    CheckCircle2,
    Loader2,
    Eye,
    Sparkles,
    Tag,
    X,
    GitPullRequest,
    GitMerge,
    XCircle,
    Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/Auth";
import slugify from "@/utils/slugify";
import { apiFetch } from "@/lib/api-fetch";
import { GithubApiError } from "@/lib/github/types";
import { parsePrUrl, toCanonicalPrUrl } from "@/lib/github/parsePrUrl";
import type { PrMetadata as NormalizedPrMetadata } from "@/lib/github/types";
import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { toast } from "sonner";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });
import MarkdownPreview from "@/components/MarkdownPreview";

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = "url" | "preview" | "tags" | "review";

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: "url", label: "PR URL", icon: <Link2 className="size-4" /> },
    { id: "preview", label: "Question", icon: <Sparkles className="size-4" /> },
    { id: "tags", label: "Tags", icon: <Tag className="size-4" /> },
    { id: "review", label: "Review", icon: <Eye className="size-4" /> },
];

type PrMetadataResponse = NormalizedPrMetadata & {
    owner: string;
    repoName: string;
    prNumber: number;
    prUrl: string;
    diffPreviewLines: string[];
};

// Best-effort language → tag mapping for pre-population (Phase 3, Step 3).
const LANGUAGE_TAG_MAP: Record<string, string> = {
    TypeScript: "typescript",
    JavaScript: "javascript",
    Python: "python",
    Go: "go",
    Rust: "rust",
    Java: "java",
    "C++": "cpp",
    C: "c",
    "C#": "csharp",
    Ruby: "ruby",
    PHP: "php",
    Swift: "swift",
    Kotlin: "kotlin",
    HTML: "html",
    CSS: "css",
    Shell: "shell",
};

const PR_STATUS_META: Record<
    "open" | "merged" | "closed",
    { label: string; color: string; icon: React.ReactNode }
> = {
    open: { label: "Open", color: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400", icon: <GitPullRequest className="size-3.5" /> },
    merged: { label: "Merged", color: "border-purple-500/30 bg-purple-500/10 text-purple-400", icon: <GitMerge className="size-3.5" /> },
    closed: { label: "Closed", color: "border-red-500/30 bg-red-500/10 text-red-400", icon: <XCircle className="size-3.5" /> },
};

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AskPrQuestionPage() {
    const { user, hydrated } = useAuthStore();
    const router = useRouter();

    // Step 1 — URL input state
    const [prUrlInput, setPrUrlInput] = React.useState("");
    const [urlFormatError, setUrlFormatError] = React.useState("");
    const [isCheckingExisting, setIsCheckingExisting] = React.useState(false);
    const [existingQuestion, setExistingQuestion] = React.useState<{ questionId: string; title: string } | null>(null);
    const [isFetchingMetadata, setIsFetchingMetadata] = React.useState(false);
    const [metadata, setMetadata] = React.useState<PrMetadataResponse | null>(null);

    // Step 2 — question content
    const [title, setTitle] = React.useState("");
    const [content, setContent] = React.useState("");

    // Step 3 — tags
    const [tags, setTags] = React.useState<string[]>([]);
    const [tagInput, setTagInput] = React.useState("");
    const [tagError, setTagError] = React.useState("");
    const tagsPrePopulated = React.useRef(false);

    // ui state
    const [activeStep, setActiveStep] = React.useState<Step>("url");
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState("");
    const [success, setSuccess] = React.useState(false);

    React.useEffect(() => {
        if (hydrated && !user) router.push("/login");
    }, [user, hydrated, router]);

    // ── Step 1: live format validation as the user types/pastes ──
    React.useEffect(() => {
        if (!prUrlInput.trim()) {
            setUrlFormatError("");
            setExistingQuestion(null);
            return;
        }
        try {
            parsePrUrl(prUrlInput);
            setUrlFormatError("");
        } catch (err) {
            setUrlFormatError(err instanceof GithubApiError ? err.message : "Invalid PR URL");
            setExistingQuestion(null);
            return;
        }

        // Debounced existing-question check
        const handle = setTimeout(async () => {
            setIsCheckingExisting(true);
            try {
                const res = await apiFetch<{ data: { exists: boolean; questionId?: string; title?: string } }>(
                    `/api/pr-question/check?prUrl=${encodeURIComponent(prUrlInput.trim())}`
                );
                if (res.data.exists && res.data.questionId && res.data.title) {
                    setExistingQuestion({ questionId: res.data.questionId, title: res.data.title });
                } else {
                    setExistingQuestion(null);
                }
            } catch {
                // Non-fatal — the check is a convenience, not a blocker.
                setExistingQuestion(null);
            } finally {
                setIsCheckingExisting(false);
            }
        }, 400);

        return () => clearTimeout(handle);
    }, [prUrlInput]);

    const handleFetchPr = async () => {
        setError("");
        try {
            parsePrUrl(prUrlInput);
        } catch (err) {
            setUrlFormatError(err instanceof GithubApiError ? err.message : "Invalid PR URL");
            return;
        }

        setIsFetchingMetadata(true);
        try {
            const res = await apiFetch<{ data: PrMetadataResponse }>("/api/pr-question/metadata", {
                method: "POST",
                body: JSON.stringify({ prUrl: prUrlInput.trim() }),
            });
            setMetadata(res.data);

            // Pre-populate tags from the repo's primary language, once.
            if (!tagsPrePopulated.current) {
                const mapped = res.data.language ? LANGUAGE_TAG_MAP[res.data.language] : undefined;
                if (mapped) setTags([mapped]);
                tagsPrePopulated.current = true;
            }

            setActiveStep("preview");
        } catch (err: any) {
            // Never a generic "something went wrong" — surface the specific
            // message the metadata route returned (private repo, not found,
            // rate limited, etc).
            setError(err?.message || "Couldn't fetch this PR. Please check the URL and try again.");
        } finally {
            setIsFetchingMetadata(false);
        }
    };

    // ── Tags ──
    const addTag = (tag: string) => {
        const cleaned = tag.toLowerCase().trim().replace(/\s+/g, "-");
        if (!cleaned) return;
        if (tags.length >= 5) { setTagError("Maximum 5 tags allowed"); return; }
        if (cleaned.length > 25) { setTagError("Tag too long (max 25 chars)"); return; }
        if (tags.includes(cleaned)) { setTagError("Tag already added"); return; }
        setTags((prev) => [...prev, cleaned]);
        setTagInput("");
        setTagError("");
    };
    const removeTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));
    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); }
        if (e.key === "Backspace" && tagInput === "" && tags.length > 0) removeTag(tags[tags.length - 1]);
    };

    const validateStep = (step: Step): string => {
        if (step === "preview" && title.trim().length < 15) return "Title must be at least 15 characters";
        if (step === "preview" && content.trim().length < 10) return "Add a sentence or two about what you're asking";
        if (step === "tags" && tags.length === 0) return "Add at least one tag";
        return "";
    };

    const goToStep = (step: Step) => {
        if (step !== "url" && !metadata) return; // can't skip past fetching the PR
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
        if (step === "url") return Boolean(metadata);
        if (step === "preview") return title.trim().length >= 15 && content.trim().length >= 10;
        if (step === "tags") return tags.length > 0;
        return true;
    };

    const handleSubmit = async () => {
        if (!user || !metadata) return;
        const titleErr = validateStep("preview");
        const tagsErr = validateStep("tags");
        if (titleErr || tagsErr) { setError(titleErr || tagsErr); return; }

        setIsSubmitting(true);
        setError("");
        try {
            const doc = await apiFetch("/api/question", {
                method: "POST",
                body: JSON.stringify({
                    title: title.trim(),
                    content: content.trim(),
                    authorId: user.$id,
                    tags,
                    hasTestSuite: false,
                    questionType: "pr_linked",
                    prUrl: metadata.prUrl,
                    prRepoOwner: metadata.owner,
                    prRepoName: metadata.repoName,
                    prNumber: metadata.prNumber,
                    prTitle: metadata.title,
                    prStatus: metadata.status,
                    prBaseRef: metadata.baseRef,
                    prHeadRef: metadata.headRef,
                    prAuthorGithubHandle: metadata.authorHandle,
                }),
            });

            setSuccess(true);
            setTimeout(() => {
                router.push(`/questions/${doc.$id}/${slugify(title)}`);
            }, 1200);
        } catch (err: any) {
            toast.error(err.message || "Failed to create question");
            setIsSubmitting(false);
        }
    };

    if (!user) return null;

    return (
        <div className="w-full">
            <div className="mx-auto max-w-3xl">
                {/* Page Header */}
                <div className="mb-8">
                    <Link
                        href="/questions/ask"
                        className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-300"
                    >
                        <ArrowLeft className="size-4" />
                        Back to ask a question
                    </Link>
                    <h1 className="mt-2 flex items-center gap-2.5 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                        <Github className="size-7 text-[#a7c8b3]" />
                        Ask about a pull request
                    </h1>
                    <p className="mt-1.5 text-sm text-zinc-500">
                        Paste a GitHub PR URL and get help from the ByteNest community — right on the diff.
                    </p>
                </div>

                {/* ── Step Progress ── */}
                <StepProgress steps={STEPS} activeStep={activeStep} isStepComplete={isStepComplete} onStepClick={goToStep} />

                {/* ── Error Banner ── */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, y: -8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            className="mb-4 flex items-center gap-3 rounded-xl border border-red-500/10 bg-red-400/5 px-4 py-3 text-sm text-red-200/80"
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

                <div className="mt-4 space-y-4">
                    <AnimatePresence mode="wait">
                        {activeStep === "url" && (
                            <StepPanel key="url">
                                <StepHeader
                                    icon={<Link2 className="size-5" />}
                                    title="Paste a GitHub PR URL"
                                    description="e.g. https://github.com/facebook/react/pull/42 — public or private repos ByteNest has access to."
                                />
                                <div className="mt-5">
                                    <Input
                                        autoFocus
                                        value={prUrlInput}
                                        onChange={(e) => setPrUrlInput(e.target.value)}
                                        placeholder="https://github.com/owner/repo/pull/123"
                                        className="h-12 rounded-xl border-white/5 bg-white/[0.04] text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !urlFormatError && prUrlInput.trim()) handleFetchPr();
                                        }}
                                    />

                                    {urlFormatError && (
                                        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
                                            <AlertCircle className="size-3.5" /> {urlFormatError}
                                        </p>
                                    )}

                                    {isCheckingExisting && (
                                        <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-600">
                                            <Loader2 className="size-3.5 animate-spin" /> Checking for an existing question…
                                        </p>
                                    )}

                                    {existingQuestion && (
                                        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3]/5 px-4 py-3 text-sm text-zinc-300">
                                            <Info className="size-4 shrink-0 text-[#a7c8b3]" />
                                            <span>
                                                This PR already has a question on ByteNest —{" "}
                                                <Link
                                                    href={`/questions/${existingQuestion.questionId}/${slugify(existingQuestion.title)}`}
                                                    className="font-medium text-[#a7c8b3] underline underline-offset-2"
                                                >
                                                    view it
                                                </Link>
                                                . You can still ask your own question about it below.
                                            </span>
                                        </div>
                                    )}

                                    <Button
                                        onClick={handleFetchPr}
                                        disabled={!prUrlInput.trim() || Boolean(urlFormatError) || isFetchingMetadata}
                                        className="mt-5 h-11 w-full rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] text-sm font-semibold text-[#08100b] shadow-none transition hover:bg-[#b4d6bf] disabled:opacity-50"
                                    >
                                        {isFetchingMetadata ? (
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="size-4 animate-spin" />
                                                Fetching PR metadata…
                                            </div>
                                        ) : (
                                            "Fetch PR"
                                        )}
                                    </Button>
                                </div>
                            </StepPanel>
                        )}

                        {activeStep === "preview" && metadata && (
                            <StepPanel key="preview">
                                <StepHeader
                                    icon={<Sparkles className="size-5" />}
                                    title="What are you asking?"
                                    description="The diff is the context — your question is what you want help understanding."
                                />
                                <div className="mt-5 space-y-5">
                                    <PrMetadataCard metadata={metadata} />

                                    <div>
                                        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-zinc-500">
                                            Diff preview (first {metadata.diffPreviewLines.length} lines)
                                        </label>
                                        <pre className="max-h-56 overflow-auto rounded-xl border border-white/5 bg-black/40 p-4 text-xs leading-relaxed text-zinc-400">
                                            {metadata.diffPreviewLines.length > 0
                                                ? metadata.diffPreviewLines.join("\n")
                                                : "Diff preview unavailable — it will still be fetched in full once you post."}
                                        </pre>
                                    </div>

                                    <div>
                                        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-zinc-500">
                                            Title
                                        </label>
                                        <Input
                                            value={title}
                                            onChange={(e) => setTitle(e.target.value)}
                                            placeholder="e.g. Why does this PR wrap the fetch in a retry loop?"
                                            maxLength={100}
                                            className="h-12 rounded-xl border-white/5 bg-white/[0.04] text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                        />
                                        <p className="mt-1.5 text-xs text-zinc-600">{title.length}/100</p>
                                    </div>

                                    <div data-color-mode="dark">
                                        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-zinc-500">
                                            Body
                                        </label>
                                        <MDEditor
                                            value={content}
                                            onChange={(v) => setContent(v || "")}
                                            height={240}
                                            preview="live"
                                            style={{
                                                background: "transparent",
                                                border: "1px solid rgba(255,255,255,0.1)",
                                                borderRadius: "12px",
                                                overflow: "hidden",
                                            }}
                                            textareaProps={{
                                                placeholder: "I don't understand why this approach was chosen…",
                                            }}
                                        />
                                    </div>
                                </div>
                            </StepPanel>
                        )}

                        {activeStep === "tags" && (
                            <StepPanel key="tags">
                                <StepHeader
                                    icon={<Tag className="size-5" />}
                                    title="Add tags"
                                    description="Pre-filled from the repo's language where possible — add or remove as needed."
                                />
                                <div className="mt-5">
                                    <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-white/[0.04] px-3 py-2.5 focus-within:border-[#a7c8b3]/60 focus-within:ring-2 focus-within:ring-[#a7c8b3]/15">
                                        {tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="flex items-center gap-1 rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-2.5 py-1 text-xs font-medium text-[#a7c8b3]"
                                            >
                                                {tag}
                                                <button onClick={() => removeTag(tag)} className="rounded-full text-[#a7c8b3]/60 transition hover:text-[#a7c8b3]">
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
                                    {tagError && <p className="mt-2 text-xs text-red-400">{tagError}</p>}
                                    <p className="mt-3 text-xs text-zinc-600">{tags.length}/5 tags added</p>
                                </div>
                            </StepPanel>
                        )}

                        {activeStep === "review" && metadata && (
                            <StepPanel key="review">
                                <StepHeader
                                    icon={<Eye className="size-5" />}
                                    title="Review your question"
                                    description="Make sure everything looks right before posting."
                                />
                                <div className="mt-5 space-y-5">
                                    <PrMetadataCard metadata={metadata} />

                                    <PreviewBlock label="Title">
                                        {title || <span className="italic text-zinc-600">No title</span>}
                                    </PreviewBlock>

                                    <PreviewBlock label="Body">
                                        {content ? (
                                            <div data-color-mode="dark" className="prose-sm">
                                                <MarkdownPreview source={content} style={{ background: "transparent", color: "inherit" }} />
                                            </div>
                                        ) : (
                                            <span className="italic text-zinc-600">No body</span>
                                        )}
                                    </PreviewBlock>

                                    <PreviewBlock label="Tags">
                                        {tags.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {tags.map((tag) => (
                                                    <span key={tag} className="rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-2.5 py-1 text-xs font-medium text-[#a7c8b3]">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="italic text-zinc-600">No tags</span>
                                        )}
                                    </PreviewBlock>
                                </div>
                            </StepPanel>
                        )}
                    </AnimatePresence>

                    {/* ── Action Row ── */}
                    {metadata && (
                        <div className="flex items-center justify-between pt-2">
                            <button
                                onClick={() => {
                                    const idx = STEPS.findIndex((s) => s.id === activeStep);
                                    if (idx > 0) { setError(""); setActiveStep(STEPS[idx - 1].id); }
                                }}
                                disabled={activeStep === "url"}
                                className="flex h-10 items-center gap-2 rounded-xl border border-white/5 bg-white/[0.04] px-4 text-sm text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30"
                            >
                                <ArrowLeft className="size-4" />
                                Back
                            </button>

                            {activeStep !== "review" ? (
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
                                        <div className="flex items-center gap-2">
                                            <Loader2 className="size-4 animate-spin" />
                                            Posting…
                                        </div>
                                    ) : (
                                        "Post Question"
                                    )}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PrMetadataCard({ metadata }: { metadata: PrMetadataResponse }) {
    const statusMeta = PR_STATUS_META[metadata.status];
    return (
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-medium text-zinc-100">{metadata.title}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                        {metadata.owner}/{metadata.repoName} · #{metadata.prNumber} · by {metadata.authorHandle || "unknown"}
                    </p>
                </div>
                <span className={cn("flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", statusMeta.color)}>
                    {statusMeta.icon}
                    {statusMeta.label}
                </span>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                <code className="rounded bg-white/5 px-1.5 py-0.5">{metadata.headRef}</code>
                <ChevronRight className="size-3.5" />
                <code className="rounded bg-white/5 px-1.5 py-0.5">{metadata.baseRef}</code>
            </div>
        </div>
    );
}

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
                                isActive ? "bg-[#a7c8b3]/15 text-[#a7c8b3]" : isPast ? "text-zinc-400 hover:text-zinc-200" : "text-zinc-600 hover:text-zinc-500"
                            )}
                        >
                            <span
                                className={cn(
                                    "flex size-6 items-center justify-center rounded-full text-[10px] font-bold transition",
                                    isActive ? "bg-[#a7c8b3] text-[#08100b]" : isPast ? "bg-zinc-700 text-zinc-200" : "bg-white/10 text-zinc-500"
                                )}
                            >
                                {isComplete ? <CheckCircle2 className="size-3" /> : idx + 1}
                            </span>
                            <span className="hidden sm:inline">{step.label}</span>
                        </button>
                        {idx < steps.length - 1 && <div className="h-px w-4 flex-1 bg-white/5 sm:w-8 sm:flex-none" />}
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
            className="rounded-2xl border border-white/5 bg-white/[0.02] p-6 shadow-xl"
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
            <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-zinc-300">{children}</div>
        </div>
    );
}
