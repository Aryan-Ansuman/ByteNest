"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
    Loader2,
    ArrowLeft,
    Hash,
    Globe,
    Lock,
    Clock,
    Users,
    Code,
    X,
    ChevronDown,
    Info,
    Sparkles,
    Radio,
    Check,
    AlertCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { DiscussionRoom } from "@/types/rooms";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const SLOW_MODE_OPTIONS = [
    { value: "off",  label: "Off",  description: "No cooldown" },
    { value: "5s",   label: "5s",   description: "Short pause" },
    { value: "30s",  label: "30s",  description: "Balanced" },
    { value: "60s",  label: "60s",  description: "Calm discussions" },
] as const;

const MAX_MEMBERS_PRESETS = [10, 25, 50, 100] as const;

const POPULAR_TAGS = [
    "javascript", "typescript", "react", "nextjs", "python",
    "rust", "go", "css", "node", "help", "review", "interview",
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({
    icon: Icon,
    title,
    description,
}: {
    icon: React.ElementType;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3 mb-5">
            <div className="mt-0.5 w-7 h-7 rounded-lg bg-brand/10 border border-[#a7c8b3]/20 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-brand" />
            </div>
            <div>
                <h2 className="text-sm font-semibold text-tx">{title}</h2>
                <p className="text-xs text-tx-muted mt-0.5 leading-relaxed">{description}</p>
            </div>
        </div>
    );
}

function Tooltip({ text }: { text: string }) {
    const [show, setShow] = useState(false);
    return (
        <span className="relative inline-flex">
            <button
                type="button"
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
                className="text-tx-disabled hover:text-tx-secondary transition-colors"
            >
                <Info className="w-3.5 h-3.5" />
            </button>
            {show && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-surface border border-zinc-700 rounded-lg px-3 py-2 text-[11px] text-tx-secondary leading-relaxed shadow-xl z-50 pointer-events-none">
                    {text}
                    <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
                </span>
            )}
        </span>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CreateRoomPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [step, setStep] = useState<1 | 2>(1);

    // Form state
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [visibility, setVisibility] = useState<"public" | "private">("public");
    const [slowMode, setSlowMode] = useState<"off" | "5s" | "30s" | "60s">("off");
    const [maxMembers, setMaxMembers] = useState<number>(50);
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [showTagSuggestions, setShowTagSuggestions] = useState(false);
    const [namePreview, setNamePreview] = useState("");

    const tagInputRef = useRef<HTMLInputElement>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        nameInputRef.current?.focus();
    }, []);

    // Live name preview with truncation
    useEffect(() => {
        if (name.trim()) {
            setNamePreview(`#${name.trim().toLowerCase().replace(/\s+/g, "-")}`);
        } else {
            setNamePreview("");
        }
    }, [name]);

    // ─── Tag handling ──────────────────────────────────────────────────────────

    const addTag = (tag: string) => {
        const normalized = tag.trim().toLowerCase().replace(/[^a-z0-9-+#.]/g, "");
        if (!normalized || tags.includes(normalized) || tags.length >= 8) return;
        setTags((prev) => [...prev, normalized]);
        setTagInput("");
        setShowTagSuggestions(false);
    };

    const removeTag = (tag: string) => {
        setTags((prev) => prev.filter((t) => t !== tag));
    };

    const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (["Enter", ",", " ", "Tab"].includes(e.key)) {
            e.preventDefault();
            if (tagInput.trim()) addTag(tagInput);
        } else if (e.key === "Backspace" && !tagInput && tags.length > 0) {
            removeTag(tags[tags.length - 1]);
        }
    };

    const filteredSuggestions = POPULAR_TAGS.filter(
        (t) => !tags.includes(t) && t.includes(tagInput.toLowerCase())
    ).slice(0, 6);

    // ─── Submit ────────────────────────────────────────────────────────────────

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) { setError("Room name is required."); return; }
        if (name.trim().length < 3) { setError("Name must be at least 3 characters."); return; }

        setError("");
        setLoading(true);

        try {
            const data = await apiFetch<{ room: DiscussionRoom }>("/api/rooms", {
                method: "POST",
                body: JSON.stringify({
                    name: name.trim(),
                    description: description.trim(),
                    visibility,
                    slowMode,
                    maxMembers,
                    tags,
                }),
            });
            router.push(`/rooms/${data.room.$id}`);
        } catch (err: any) {
            setError(err.message || "Failed to create room. Please try again.");
            setLoading(false);
        }
    }

    const canProceed = name.trim().length >= 3;

    // ─── Render ────────────────────────────────────────────────────────────────

    return (
        <main className="min-h-screen bg-[#0a0a0a] text-tx">
            {/* Top bar */}
            <div className="sticky top-0 z-10 h-12 border-b border-white/5 bg-[#080808]/90 backdrop-blur-sm flex items-center px-4 gap-3">
                <Link
                    href="/rooms"
                    className="flex items-center gap-1.5 text-xs text-tx-muted hover:text-tx-secondary transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Rooms
                </Link>
                <div className="w-px h-4 bg-surface" />
                <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded flex items-center justify-center bg-brand/10">
                        <Radio className="w-2.5 h-2.5 text-brand" />
                    </div>
                    <span className="text-xs text-tx-secondary font-medium">New Room</span>
                </div>
                {namePreview && (
                    <>
                        <div className="w-px h-4 bg-surface" />
                        <span className="text-xs text-tx-disabled font-mono">{namePreview}</span>
                    </>
                )}
            </div>

            <div className="max-w-2xl mx-auto px-4 py-10">
                {/* Page header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-brand/10 border border-[#a7c8b3]/20 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-brand" />
                        </div>
                        <h1 className="text-xl font-bold text-tx tracking-tight">
                            Create a room
                        </h1>
                    </div>
                    <p className="text-sm text-tx-muted leading-relaxed ml-10">
                        A space for real-time chat and collaborative coding. Get it set up in seconds.
                    </p>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-2 mb-8 ml-10">
                    {[1, 2].map((s) => (
                        <button
                            key={s}
                            type="button"
                            onClick={() => { if (s === 2 && !canProceed) return; setStep(s as 1 | 2); }}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                                step === s
                                    ? "bg-brand/10 text-brand border border-[#a7c8b3]/25"
                                    : s < step
                                    ? "text-tx-secondary hover:text-tx cursor-pointer"
                                    : "text-tx-disabled cursor-not-allowed"
                            )}
                        >
                            <span className={cn(
                                "w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold",
                                step === s ? "bg-brand/20 text-brand" : s < step ? "bg-zinc-700 text-tx-secondary" : "bg-surface text-tx-disabled"
                            )}>
                                {s < step ? <Check className="w-2.5 h-2.5" /> : s}
                            </span>
                            {s === 1 ? "Identity" : "Settings"}
                        </button>
                    ))}
                    <div className="flex-1 h-px bg-zinc-800/60" />
                </div>

                <form onSubmit={handleSubmit}>
                    {/* ── STEP 1: Room identity ──────────────────────────────── */}
                    {step === 1 && (
                        <div className="space-y-6">
                            {/* Name */}
                            <div className="bg-panel/40 border border-white/5 rounded-2xl p-5">
                                <SectionHeader
                                    icon={Hash}
                                    title="Room identity"
                                    description="Give your room a name and topic so people know what to expect."
                                />

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-tx-secondary mb-1.5">
                                            Room name <span className="text-status-danger">*</span>
                                        </label>
                                        <div className="relative">
                                            <input
                                                ref={nameInputRef}
                                                required
                                                minLength={3}
                                                maxLength={100}
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="e.g. React Debugging Session"
                                                className={cn(
                                                    "w-full bg-black/40 border rounded-xl px-3.5 py-2.5 text-sm text-tx placeholder-zinc-600 transition-colors focus:outline-none",
                                                    name.trim().length > 0 && name.trim().length < 3
                                                        ? "border-amber-500/40 focus:border-amber-500/60"
                                                        : "border-b focus:border-[#a7c8b3]/40"
                                                )}
                                            />
                                            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                                <span className={cn(
                                                    "text-[10px] tabular-nums",
                                                    name.length > 90 ? "text-amber-500" : "text-zinc-700"
                                                )}>
                                                    {name.length}/100
                                                </span>
                                                {name.trim().length >= 3 && (
                                                    <Check className="w-3.5 h-3.5 text-brand" />
                                                )}
                                            </div>
                                        </div>
                                        {name.trim().length > 0 && name.trim().length < 3 && (
                                            <p className="text-[11px] text-amber-500/80 mt-1.5 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                At least 3 characters required
                                            </p>
                                        )}
                                    </div>

                                    {/* Description */}
                                    <div>
                                        <label className="block text-xs font-medium text-tx-secondary mb-1.5">
                                            Description{" "}
                                            <span className="text-tx-disabled font-normal">(optional)</span>
                                        </label>
                                        <textarea
                                            maxLength={300}
                                            rows={3}
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="What's this room about? What will you be working on?"
                                            className="w-full bg-black/40 border border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-tx placeholder-zinc-600 focus:outline-none focus:border-[#a7c8b3]/40 transition-colors resize-none leading-relaxed"
                                        />
                                        <div className="flex justify-end mt-1">
                                            <span className={cn(
                                                "text-[10px] tabular-nums",
                                                description.length > 270 ? "text-amber-500" : "text-zinc-700"
                                            )}>
                                                {description.length}/300
                                            </span>
                                        </div>
                                    </div>

                                    {/* Tags */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1.5">
                                            <label className="text-xs font-medium text-tx-secondary">
                                                Tags{" "}
                                                <span className="text-tx-disabled font-normal">(up to 8)</span>
                                            </label>
                                            <Tooltip text="Tags help others discover your room. Press Enter, comma, or space to add a tag." />
                                        </div>

                                        {/* Tag input with pills inside */}
                                        <div
                                            className={cn(
                                                "min-h-[42px] bg-black/40 border rounded-xl px-3 py-2 flex flex-wrap gap-1.5 cursor-text transition-colors",
                                                showTagSuggestions
                                                    ? "border-[#a7c8b3]/40"
                                                    : "border-b hover:border-zinc-700"
                                            )}
                                            onClick={() => tagInputRef.current?.focus()}
                                        >
                                            {tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand/10 border border-[#a7c8b3]/25 text-brand text-[11px] font-medium"
                                                >
                                                    <Hash className="w-2.5 h-2.5 opacity-60" />
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                                                        className="ml-0.5 text-brand/50 hover:text-brand transition-colors"
                                                    >
                                                        <X className="w-2.5 h-2.5" />
                                                    </button>
                                                </span>
                                            ))}
                                            {tags.length < 8 && (
                                                <input
                                                    ref={tagInputRef}
                                                    value={tagInput}
                                                    onChange={(e) => {
                                                        setTagInput(e.target.value);
                                                        setShowTagSuggestions(true);
                                                    }}
                                                    onKeyDown={handleTagKeyDown}
                                                    onFocus={() => setShowTagSuggestions(true)}
                                                    onBlur={() => setTimeout(() => setShowTagSuggestions(false), 150)}
                                                    placeholder={tags.length === 0 ? "react, nextjs, help…" : ""}
                                                    className="flex-1 min-w-[100px] bg-transparent text-sm text-tx placeholder-zinc-600 outline-none"
                                                />
                                            )}
                                        </div>

                                        {/* Suggestions dropdown */}
                                        {showTagSuggestions && filteredSuggestions.length > 0 && (
                                            <div className="mt-1 bg-panel border border-white/5 rounded-xl p-2 shadow-xl">
                                                <p className="text-[10px] text-tx-disabled font-medium px-1 mb-1.5">
                                                    Popular tags
                                                </p>
                                                <div className="flex flex-wrap gap-1">
                                                    {filteredSuggestions.map((tag) => (
                                                        <button
                                                            key={tag}
                                                            type="button"
                                                            onMouseDown={(e) => { e.preventDefault(); addTag(tag); }}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800/60 hover:bg-surface border border-white/5 text-tx-secondary hover:text-tx text-[11px] font-medium transition-colors"
                                                        >
                                                            <Hash className="w-2.5 h-2.5 opacity-50" />
                                                            {tag}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Visibility */}
                            <div className="bg-panel/40 border border-white/5 rounded-2xl p-5">
                                <SectionHeader
                                    icon={Globe}
                                    title="Visibility"
                                    description="Control who can find and join your room."
                                />

                                <div className="grid grid-cols-2 gap-3">
                                    {(["public", "private"] as const).map((v) => {
                                        const Icon = v === "public" ? Globe : Lock;
                                        const isSelected = visibility === v;
                                        return (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => setVisibility(v)}
                                                className={cn(
                                                    "relative flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all",
                                                    isSelected
                                                        ? "bg-brand/5 border-brand-border"
                                                        : "bg-black/20 border-b hover:border-zinc-700"
                                                )}
                                            >
                                                {isSelected && (
                                                    <span className="absolute top-3 right-3 w-4 h-4 rounded-full bg-brand/20 flex items-center justify-center">
                                                        <Check className="w-2.5 h-2.5 text-brand" />
                                                    </span>
                                                )}
                                                <div className={cn(
                                                    "w-7 h-7 rounded-lg flex items-center justify-center",
                                                    isSelected ? "bg-brand/15" : "bg-zinc-800/60"
                                                )}>
                                                    <Icon className={cn(
                                                        "w-3.5 h-3.5",
                                                        isSelected ? "text-brand" : "text-tx-muted"
                                                    )} />
                                                </div>
                                                <div>
                                                    <p className={cn(
                                                        "text-xs font-semibold capitalize",
                                                        isSelected ? "text-tx" : "text-tx-secondary"
                                                    )}>
                                                        {v}
                                                    </p>
                                                    <p className="text-[11px] text-tx-disabled mt-0.5">
                                                        {v === "public"
                                                            ? "Listed in room directory"
                                                            : "Invite link required"}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {visibility === "private" && (
                                    <div className="mt-3 flex items-start gap-2 bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-3">
                                        <Info className="w-3.5 h-3.5 text-brand mt-0.5 shrink-0" />
                                        <p className="text-[11px] text-brand/80 leading-relaxed">
                                            An invite link will be generated after creation. Share it with people you want in the room.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    disabled={!canProceed}
                                    onClick={() => setStep(2)}
                                    className={cn(
                                        "flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all",
                                        canProceed
                                            ? "bg-brand text-[#08100b] hover:bg-[#b4d6bf] active:scale-[0.98]"
                                            : "bg-surface text-tx-disabled cursor-not-allowed"
                                    )}
                                >
                                    Continue
                                    <ChevronDown className="w-4 h-4 -rotate-90" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── STEP 2: Room settings ──────────────────────────────── */}
                    {step === 2 && (
                        <div className="space-y-6">
                            {/* Slow Mode */}
                            <div className="bg-panel/40 border border-white/5 rounded-2xl p-5">
                                <SectionHeader
                                    icon={Clock}
                                    title="Slow mode"
                                    description="Throttle how often members can send messages to keep conversations manageable."
                                />

                                <div className="grid grid-cols-4 gap-2">
                                    {SLOW_MODE_OPTIONS.map((opt) => {
                                        const isSelected = slowMode === opt.value;
                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setSlowMode(opt.value)}
                                                className={cn(
                                                    "flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-center transition-all",
                                                    isSelected
                                                        ? "bg-amber-500/5 border-amber-500/30 text-amber-300"
                                                        : "bg-black/20 border-b text-tx-muted hover:border-zinc-700 hover:text-tx-secondary"
                                                )}
                                            >
                                                <span className={cn(
                                                    "text-sm font-bold tabular-nums",
                                                    isSelected ? "text-amber-300" : "text-tx-secondary"
                                                )}>
                                                    {opt.label}
                                                </span>
                                                <span className={cn(
                                                    "text-[10px]",
                                                    isSelected ? "text-amber-500/70" : "text-zinc-700"
                                                )}>
                                                    {opt.description}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Max Members */}
                            <div className="bg-panel/40 border border-white/5 rounded-2xl p-5">
                                <SectionHeader
                                    icon={Users}
                                    title="Member limit"
                                    description="Cap how many people can join simultaneously. You can increase this later."
                                />

                                <div className="space-y-4">
                                    <div className="grid grid-cols-4 gap-2">
                                        {MAX_MEMBERS_PRESETS.map((n) => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setMaxMembers(n)}
                                                className={cn(
                                                    "py-2.5 rounded-xl border text-sm font-semibold transition-all",
                                                    maxMembers === n
                                                        ? "bg-brand/8 border-brand-border text-brand"
                                                        : "bg-black/20 border-b text-tx-muted hover:border-zinc-700 hover:text-tx-secondary"
                                                )}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Custom slider */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] text-tx-disabled">Custom limit</span>
                                            <span className="text-xs font-semibold text-tx-secondary tabular-nums">
                                                {maxMembers} members
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={2}
                                            max={100}
                                            step={1}
                                            value={maxMembers}
                                            onChange={(e) => setMaxMembers(Number(e.target.value))}
                                            className="w-full h-1.5 appearance-none rounded-full outline-none cursor-pointer"
                                            style={{
                                                background: `linear-gradient(to right, #a7c8b3 0%, #a7c8b3 ${maxMembers}%, #27272a ${maxMembers}%, #27272a 100%)`,
                                            }}
                                        />
                                        <div className="flex justify-between text-[10px] text-zinc-700">
                                            <span>2</span>
                                            <span>100</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Code session note */}
                            <div className="bg-panel/40 border border-white/5 rounded-2xl p-5">
                                <SectionHeader
                                    icon={Code}
                                    title="Collaborative coding"
                                    description="Code sessions can be started from inside the room after creation."
                                />
                                <div className="bg-black/30 border border-white/5 rounded-xl p-3 flex items-start gap-2.5">
                                    <Code className="w-3.5 h-3.5 text-status-success/70 mt-0.5 shrink-0" />
                                    <p className="text-[11px] text-tx-muted leading-relaxed">
                                        As host, you can launch a live editor supporting JavaScript, TypeScript, Python, Rust, Go, HTML, and CSS. All members will see it open in real-time.
                                    </p>
                                </div>
                            </div>

                            {/* Review summary */}
                            <div className="bg-panel/40 border border-white/5 rounded-2xl p-5">
                                <h3 className="text-xs font-semibold text-tx-secondary mb-4 uppercase tracking-wider">
                                    Summary
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-tx-muted">Name</span>
                                        <span className="text-tx font-medium truncate max-w-[220px]">
                                            {name || <span className="text-tx-disabled italic">untitled</span>}
                                        </span>
                                    </div>
                                    {description && (
                                        <div className="flex items-start justify-between gap-4 text-sm">
                                            <span className="text-tx-muted shrink-0">Description</span>
                                            <span className="text-tx-secondary text-right text-xs line-clamp-2 max-w-[220px]">
                                                {description}
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-tx-muted">Visibility</span>
                                        <span className="inline-flex items-center gap-1 text-tx-secondary capitalize">
                                            {visibility === "public"
                                                ? <Globe className="w-3 h-3 text-tx-muted" />
                                                : <Lock className="w-3 h-3 text-tx-muted" />
                                            }
                                            {visibility}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-tx-muted">Slow mode</span>
                                        <span className="text-tx-secondary">
                                            {slowMode === "off" ? "Off" : slowMode}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                        <span className="text-tx-muted">Max members</span>
                                        <span className="text-tx-secondary">{maxMembers}</span>
                                    </div>
                                    {tags.length > 0 && (
                                        <div className="flex items-start justify-between gap-4 text-sm">
                                            <span className="text-tx-muted shrink-0">Tags</span>
                                            <div className="flex flex-wrap justify-end gap-1 max-w-[220px]">
                                                {tags.map((t) => (
                                                    <span
                                                        key={t}
                                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-brand/8 border border-[#a7c8b3]/20 text-brand/80 text-[10px]"
                                                    >
                                                        <Hash className="w-2 h-2" />{t}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="flex items-center gap-2.5 bg-status-danger/8 border border-[#ef4444]/20 text-status-danger text-xs rounded-xl px-4 py-3">
                                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* Actions */}
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    disabled={loading}
                                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm text-tx-muted hover:text-tx-secondary hover:bg-surface-hover transition-all disabled:opacity-40"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    Back
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || !canProceed}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all",
                                        loading || !canProceed
                                            ? "bg-surface text-tx-muted cursor-not-allowed"
                                            : "bg-brand text-[#08100b] hover:bg-[#b4d6bf] active:scale-[0.98]"
                                    )}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Creating room…
                                        </>
                                    ) : (
                                        <>
                                            <Radio className="w-4 h-4" />
                                            Create room
                                        </>
                                    )}
                                </button>
                            </div>

                            <p className="text-center text-[11px] text-zinc-700">
                                You'll be added as host automatically.
                            </p>
                        </div>
                    )}
                </form>
            </div>
        </main>
    );
}
