"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowLeft,
    ArrowUp,
    ArrowDown,
    ChevronRight,
    GitCompare,
    Layers,
    Tag,
    Eye,
    AlertCircle,
    CheckCircle2,
    Loader2,
    X,
    Zap,
    TrendingUp,
    Code2,
    Package,
    Wrench,
    Shield,
    GraduationCap,
    Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/Auth";
import slugify from "@/utils/slugify";
import { apiFetch } from "@/lib/api-fetch";
import { toast } from "sonner";
import { ADR_DIMENSIONS, type AdrDimension } from "@/models/name";
import dynamic from "next/dynamic";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });
import MarkdownPreview from "@/components/MarkdownPreview";

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = "framing" | "dimensions" | "tags" | "preview";

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
    { id: "framing", label: "Decision", icon: <GitCompare className="size-4" /> },
    { id: "dimensions", label: "Dimensions", icon: <Layers className="size-4" /> },
    { id: "tags", label: "Tags", icon: <Tag className="size-4" /> },
    { id: "preview", label: "Preview", icon: <Eye className="size-4" /> },
];

// Decision 2 — fixed catalog, ADR_DIMENSIONS is the source of truth
// (shared with the server-side validator in Phase 3). Presentation-only
// metadata lives here since it's UI concern, not schema.
const DIMENSION_META: Record<AdrDimension, { label: string; description: string; icon: React.ReactNode }> = {
    performance: {
        label: "Performance",
        description: "Raw speed and resource efficiency under real workloads.",
        icon: <Zap className="size-4" />,
    },
    scalability: {
        label: "Scalability",
        description: "How gracefully it handles growth in data, users, or load.",
        icon: <TrendingUp className="size-4" />,
    },
    developer_experience: {
        label: "Developer Experience",
        description: "How pleasant and productive it is to build with day-to-day.",
        icon: <Code2 className="size-4" />,
    },
    ecosystem_maturity: {
        label: "Ecosystem Maturity",
        description: "Depth of libraries, tooling, community support, and docs.",
        icon: <Package className="size-4" />,
    },
    long_term_maintainability: {
        label: "Long-Term Maintainability",
        description: "How easy it stays to extend and reason about years later.",
        icon: <Wrench className="size-4" />,
    },
    security: {
        label: "Security",
        description: "Track record, attack surface, and how easy it is to use safely.",
        icon: <Shield className="size-4" />,
    },
    learning_curve: {
        label: "Learning Curve",
        description: "How quickly a new team member becomes productive with it.",
        icon: <GraduationCap className="size-4" />,
    },
    operational_complexity: {
        label: "Operational Complexity",
        description: "Effort to deploy, monitor, and keep running in production.",
        icon: <Settings2 className="size-4" />,
    },
};

const MIN_DIMENSIONS = 3;
const MAX_DIMENSIONS = 8;

// Same fallback list AskQuestionPage.tsx uses for tag suggestions —
// substring-matched against the option names (Phase 2, Step 3). No
// technologyTermsCollection lookup in Phase 1, per the plan's fallback note.
const TAG_SUGGESTIONS = [
    "javascript", "typescript", "react", "next.js", "node.js",
    "python", "css", "tailwindcss", "sql", "mongodb", "postgresql",
    "docker", "git", "api", "authentication", "performance",
    "testing", "deployment", "prisma", "graphql", "websocket",
    "redis", "kubernetes", "rust", "go",
];

// Plain-text sanitizer for option names — Phase 2 spec: "no markdown,
// plain text only." Strips common markdown control characters rather
// than running full markdown parsing, since option names are short UI
// labels (radar chart legend, comparison header), not rendered content.
function sanitizePlainText(input: string): string {
    return input.replace(/[*_`#>[\]()~]/g, "").replace(/\s+/g, " ").trim();
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AskAdrPage() {
    const { user, hydrated } = useAuthStore();
    const router = useRouter();

    // Step 1 — Decision Framing
    const [optionA, setOptionA] = React.useState("");
    const [optionADescription, setOptionADescription] = React.useState("");
    const [optionB, setOptionB] = React.useState("");
    const [optionBDescription, setOptionBDescription] = React.useState("");
    const [content, setContent] = React.useState("");

    // Step 2 — Dimension Selection (ordered — order drives radar spoke layout)
    const [selectedDimensions, setSelectedDimensions] = React.useState<AdrDimension[]>([]);

    // Step 3 — Tags
    const [tags, setTags] = React.useState<string[]>([]);
    const [tagInput, setTagInput] = React.useState("");
    const [tagError, setTagError] = React.useState("");
    const [filteredSuggestions, setFilteredSuggestions] = React.useState<string[]>([]);
    const tagsPrePopulated = React.useRef(false);

    // Step 4 — Preview (title is auto-generated, editable)
    const [title, setTitle] = React.useState("");
    const titleManuallyEdited = React.useRef(false);

    // ui state
    const [activeStep, setActiveStep] = React.useState<Step>("framing");
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState("");
    const [success, setSuccess] = React.useState(false);

    React.useEffect(() => {
        if (hydrated && !user) router.push("/login");
    }, [user, hydrated, router]);

    // Auto-generate the title from the options, unless the author has
    // already hand-edited it (Phase 2, Step 4).
    React.useEffect(() => {
        if (titleManuallyEdited.current) return;
        if (optionA.trim() && optionB.trim()) {
            setTitle(`Should we use ${optionA.trim()} or ${optionB.trim()}?`);
        }
    }, [optionA, optionB]);

    // Pre-suggest tags from the option names, once, when entering the tags
    // step for the first time (Phase 2, Step 3).
    React.useEffect(() => {
        if (activeStep !== "tags" || tagsPrePopulated.current) return;
        const haystack = `${optionA} ${optionB}`.toLowerCase();
        const matched = TAG_SUGGESTIONS.filter((t) => haystack.includes(t.replace(/\./g, ""))).slice(0, 3);
        if (matched.length > 0) setTags((prev) => Array.from(new Set([...prev, ...matched])));
        tagsPrePopulated.current = true;
    }, [activeStep, optionA, optionB]);

    // ── Dimensions ──
    const toggleDimension = (dim: AdrDimension) => {
        setSelectedDimensions((prev) => {
            if (prev.includes(dim)) return prev.filter((d) => d !== dim);
            if (prev.length >= MAX_DIMENSIONS) return prev; // silently capped; button is disabled too
            return [...prev, dim];
        });
    };
    const moveDimension = (index: number, direction: -1 | 1) => {
        setSelectedDimensions((prev) => {
            const target = index + direction;
            if (target < 0 || target >= prev.length) return prev;
            const next = [...prev];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    // ── Tags ──
    React.useEffect(() => {
        if (tagInput.length > 0) {
            setFilteredSuggestions(
                TAG_SUGGESTIONS.filter((t) => t.includes(tagInput.toLowerCase()) && !tags.includes(t)).slice(0, 6)
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

    // ── Step validation ──
    const validateStep = (step: Step): string => {
        if (step === "framing") {
            if (optionA.trim().length < 2) return "Option A needs a name (at least 2 characters)";
            if (optionA.trim().length > 100) return "Option A name is too long (max 100 characters)";
            if (optionB.trim().length < 2) return "Option B needs a name (at least 2 characters)";
            if (optionB.trim().length > 100) return "Option B name is too long (max 100 characters)";
            if (content.trim().length < 30) return "Add more context about the decision (at least 30 characters)";
        }
        if (step === "dimensions") {
            if (selectedDimensions.length < MIN_DIMENSIONS) return `Select at least ${MIN_DIMENSIONS} dimensions`;
            if (selectedDimensions.length > MAX_DIMENSIONS) return `Select at most ${MAX_DIMENSIONS} dimensions`;
        }
        if (step === "tags" && tags.length === 0) return "Add at least one tag";
        return "";
    };

    const isStepComplete = (step: Step): boolean => {
        if (step === "framing")
            return optionA.trim().length >= 2 && optionB.trim().length >= 2 && content.trim().length >= 30;
        if (step === "dimensions")
            return selectedDimensions.length >= MIN_DIMENSIONS && selectedDimensions.length <= MAX_DIMENSIONS;
        if (step === "tags") return tags.length > 0;
        return true;
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

    const handleSubmit = async () => {
        if (!user) return;
        const framingErr = validateStep("framing");
        const dimensionsErr = validateStep("dimensions");
        const tagsErr = validateStep("tags");
        if (framingErr || dimensionsErr || tagsErr) {
            setError(framingErr || dimensionsErr || tagsErr);
            return;
        }
        if (title.trim().length < 15) {
            setError("Title must be at least 15 characters");
            return;
        }

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
                    questionType: "adr",
                    optionA: sanitizePlainText(optionA),
                    optionB: sanitizePlainText(optionB),
                    optionADescription: optionADescription.trim() || undefined,
                    optionBDescription: optionBDescription.trim() || undefined,
                    adrDimensions: JSON.stringify(selectedDimensions),
                }),
            });

            setSuccess(true);
            setTimeout(() => {
                router.push(`/questions/${doc.$id}/${slugify(title)}`);
            }, 1200);
        } catch (err: any) {
            toast.error(err.message || "Failed to create ADR question");
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
                        <GitCompare className="size-7 text-[#a7c8b3]" />
                        Compare two options
                    </h1>
                    <p className="mt-1.5 text-sm text-zinc-500">
                        Frame the decision, pick your dimensions, and let the community score both sides.
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
                            ADR question posted! Redirecting…
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="mt-4 space-y-4">
                    <AnimatePresence mode="wait">
                        {activeStep === "framing" && (
                            <StepPanel key="framing">
                                <StepHeader
                                    icon={<GitCompare className="size-5" />}
                                    title="Frame the decision"
                                    description="Name the two options you're weighing, then explain the specific decision you're facing — team size, project scale, constraints. This context is what makes community scores meaningful."
                                />
                                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                    <OptionPanel
                                        label="Option A"
                                        name={optionA}
                                        onNameChange={setOptionA}
                                        description={optionADescription}
                                        onDescriptionChange={setOptionADescription}
                                        namePlaceholder="e.g. PostgreSQL"
                                    />
                                    <OptionPanel
                                        label="Option B"
                                        name={optionB}
                                        onNameChange={setOptionB}
                                        description={optionBDescription}
                                        onDescriptionChange={setOptionBDescription}
                                        namePlaceholder="e.g. MongoDB"
                                    />
                                </div>

                                <div className="mt-5">
                                    <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-zinc-500">
                                        Context
                                    </label>
                                    <textarea
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        placeholder="We're a 6-person team building a real-time analytics dashboard. Expecting ~5M rows within a year, need strong consistency, and most of the team knows SQL better than document stores…"
                                        rows={5}
                                        maxLength={10000}
                                        className="w-full resize-none rounded-xl border border-white/5 bg-white/[0.04] p-3.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-[#a7c8b3]/60 focus:ring-2 focus:ring-[#a7c8b3]/15"
                                    />
                                    <p className="mt-1.5 text-xs text-zinc-600">{content.trim().length}/30 min characters</p>
                                </div>
                            </StepPanel>
                        )}

                        {activeStep === "dimensions" && (
                            <StepPanel key="dimensions">
                                <StepHeader
                                    icon={<Layers className="size-5" />}
                                    title="Select comparison dimensions"
                                    description={`Choose ${MIN_DIMENSIONS}–${MAX_DIMENSIONS} dimensions relevant to your specific decision — not all eight are meaningful for every comparison. Dimensions you select become the axes of the radar chart.`}
                                />

                                <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                                    {ADR_DIMENSIONS.map((dim) => {
                                        const meta = DIMENSION_META[dim];
                                        const isSelected = selectedDimensions.includes(dim);
                                        const disabled = !isSelected && selectedDimensions.length >= MAX_DIMENSIONS;
                                        return (
                                            <button
                                                key={dim}
                                                type="button"
                                                disabled={disabled}
                                                onClick={() => toggleDimension(dim)}
                                                className={cn(
                                                    "flex items-start gap-3 rounded-xl border p-3.5 text-left transition",
                                                    isSelected
                                                        ? "border-[#a7c8b3]/40 bg-[#a7c8b3]/10"
                                                        : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
                                                    disabled && "cursor-not-allowed opacity-40"
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                                                        isSelected ? "bg-[#a7c8b3]/20 text-[#a7c8b3]" : "bg-white/5 text-zinc-500"
                                                    )}
                                                >
                                                    {meta.icon}
                                                </span>
                                                <span>
                                                    <span className={cn("block text-sm font-medium", isSelected ? "text-[#a7c8b3]" : "text-zinc-200")}>
                                                        {meta.label}
                                                    </span>
                                                    <span className="mt-0.5 block text-xs text-zinc-500">{meta.description}</span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <p className="mt-3 text-xs text-zinc-600">
                                    {selectedDimensions.length}/{MAX_DIMENSIONS} selected (minimum {MIN_DIMENSIONS})
                                </p>

                                {selectedDimensions.length > 0 && (
                                    <div className="mt-5">
                                        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-zinc-500">
                                            Radar chart order
                                        </label>
                                        <p className="mb-2 text-xs text-zinc-600">
                                            This is the order dimensions appear clockwise on the chart — reorder with the arrows.
                                        </p>
                                        <div className="space-y-1.5">
                                            {selectedDimensions.map((dim, i) => (
                                                <div
                                                    key={dim}
                                                    className="flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
                                                >
                                                    <span className="flex size-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-zinc-400">
                                                        {i + 1}
                                                    </span>
                                                    <span className="flex-1 text-sm text-zinc-300">{DIMENSION_META[dim].label}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => moveDimension(i, -1)}
                                                        disabled={i === 0}
                                                        className="rounded-md p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-20"
                                                    >
                                                        <ArrowUp className="size-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => moveDimension(i, 1)}
                                                        disabled={i === selectedDimensions.length - 1}
                                                        className="rounded-md p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:pointer-events-none disabled:opacity-20"
                                                    >
                                                        <ArrowDown className="size-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleDimension(dim)}
                                                        className="rounded-md p-1 text-zinc-500 transition hover:bg-red-500/10 hover:text-red-400"
                                                    >
                                                        <X className="size-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </StepPanel>
                        )}

                        {activeStep === "tags" && (
                            <StepPanel key="tags">
                                <StepHeader
                                    icon={<Tag className="size-5" />}
                                    title="Add tags"
                                    description="Pre-filled from your option names where possible — add or remove as needed."
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

                                    {filteredSuggestions.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {filteredSuggestions.map((s) => (
                                                <button
                                                    key={s}
                                                    onClick={() => addTag(s)}
                                                    className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-zinc-400 transition hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                                                >
                                                    + {s}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {tagError && <p className="mt-2 text-xs text-red-400">{tagError}</p>}
                                    <p className="mt-3 text-xs text-zinc-600">{tags.length}/5 tags added</p>
                                </div>
                            </StepPanel>
                        )}

                        {activeStep === "preview" && (
                            <StepPanel key="preview">
                                <StepHeader
                                    icon={<Eye className="size-5" />}
                                    title="Review your ADR question"
                                    description="Make sure everything looks right before posting."
                                />
                                <div className="mt-5 space-y-5">
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-zinc-500">
                                            Title
                                        </label>
                                        <Input
                                            value={title}
                                            onChange={(e) => {
                                                titleManuallyEdited.current = true;
                                                setTitle(e.target.value);
                                            }}
                                            maxLength={100}
                                            className="h-12 rounded-xl border-white/5 bg-white/[0.04] text-base text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                        />
                                        <p className="mt-1.5 text-xs text-zinc-600">{title.length}/100 · auto-generated, edit freely</p>
                                    </div>

                                    <ComparisonHeaderPreview
                                        optionA={optionA || "Option A"}
                                        optionB={optionB || "Option B"}
                                        optionADescription={optionADescription}
                                        optionBDescription={optionBDescription}
                                    />

                                    <RadarChartPlaceholder dimensions={selectedDimensions} optionA={optionA || "A"} optionB={optionB || "B"} />

                                    <PreviewBlock label="Context">
                                        <p className="whitespace-pre-wrap text-sm">{content || <span className="italic text-zinc-600">No context</span>}</p>
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
                    <div className="flex items-center justify-between pt-2">
                        <button
                            onClick={() => {
                                const idx = STEPS.findIndex((s) => s.id === activeStep);
                                if (idx > 0) { setError(""); setActiveStep(STEPS[idx - 1].id); }
                            }}
                            disabled={activeStep === "framing"}
                            className="flex h-10 items-center gap-2 rounded-xl border border-white/5 bg-white/[0.04] px-4 text-sm text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100 disabled:pointer-events-none disabled:opacity-30"
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
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="size-4 animate-spin" />
                                        Posting…
                                    </div>
                                ) : (
                                    "Post ADR Question"
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

function OptionPanel({
    label,
    name,
    onNameChange,
    description,
    onDescriptionChange,
    namePlaceholder,
}: {
    label: string;
    name: string;
    onNameChange: (v: string) => void;
    description: string;
    onDescriptionChange: (v: string) => void;
    namePlaceholder: string;
}) {
    return (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
            <Input
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={namePlaceholder}
                maxLength={100}
                className="h-11 rounded-lg border-white/5 bg-white/[0.04] text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
            />
            <textarea
                value={description}
                onChange={(e) => onDescriptionChange(e.target.value)}
                placeholder="Optional — what it is, key characteristics (max 500 chars)"
                rows={3}
                maxLength={500}
                className="mt-2 w-full resize-none rounded-lg border border-white/5 bg-white/[0.04] p-2.5 text-xs text-zinc-300 outline-none placeholder:text-zinc-600 focus:border-[#a7c8b3]/60 focus:ring-2 focus:ring-[#a7c8b3]/15"
            />
        </div>
    );
}

function ComparisonHeaderPreview({
    optionA,
    optionB,
    optionADescription,
    optionBDescription,
}: {
    optionA: string;
    optionB: string;
    optionADescription: string;
    optionBDescription: string;
}) {
    return (
        <div className="flex items-stretch gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <div className="flex-1">
                <p className="text-lg font-semibold text-zinc-100">{optionA}</p>
                {optionADescription && <p className="mt-1 text-xs text-zinc-500">{optionADescription}</p>}
            </div>
            <div className="flex items-center px-2 text-xs font-medium uppercase tracking-widest text-zinc-600">vs.</div>
            <div className="flex-1 text-right">
                <p className="text-lg font-semibold text-zinc-100">{optionB}</p>
                {optionBDescription && <p className="mt-1 text-xs text-zinc-500">{optionBDescription}</p>}
            </div>
        </div>
    );
}

// Empty/dashed spoke placeholder — Phase 2, Step 4. Real aggregated data
// isn't computed until Phase 4/5; this just proves the selected dimensions
// map onto a chart layout before the author posts.
function RadarChartPlaceholder({
    dimensions,
    optionA,
    optionB,
}: {
    dimensions: AdrDimension[];
    optionA: string;
    optionB: string;
}) {
    const size = 340;
    const center = size / 2;
    const radius = 90;
    const n = dimensions.length;

    const points = dimensions.map((dim, i) => {
        const angle = (Math.PI * 2 * i) / Math.max(n, 1) - Math.PI / 2;
        return {
            dim,
            x: center + radius * Math.cos(angle),
            y: center + radius * Math.sin(angle),
            labelX: center + (radius + 22) * Math.cos(angle),
            labelY: center + (radius + 22) * Math.sin(angle),
        };
    });

    return (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Radar chart preview</p>
            {n < MIN_DIMENSIONS ? (
                <p className="text-sm text-zinc-600">Select at least {MIN_DIMENSIONS} dimensions to preview the chart.</p>
            ) : (
                <div className="flex justify-center">
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible max-w-full">
                        {/* dashed spokes, no real data yet */}
                        {points.map((p) => (
                            <line
                                key={p.dim}
                                x1={center}
                                y1={center}
                                x2={p.x}
                                y2={p.y}
                                stroke="rgba(167,200,179,0.25)"
                                strokeDasharray="4 4"
                                strokeWidth={1}
                            />
                        ))}
                        {/* outer boundary ring */}
                        <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" />
                        {points.map((p) => (
                            <text
                                key={p.dim}
                                x={p.labelX}
                                y={p.labelY}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={9}
                                fill="rgba(212,212,216,0.7)"
                            >
                                {DIMENSION_META[p.dim].label}
                            </text>
                        ))}
                    </svg>
                </div>
            )}
            <p className="mt-2 text-center text-xs text-zinc-600">
                {optionA} and {optionB} scores fill in once the community starts assessing this comparison.
            </p>
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
