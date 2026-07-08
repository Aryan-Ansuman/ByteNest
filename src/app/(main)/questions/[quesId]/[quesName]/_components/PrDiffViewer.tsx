"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Diff, findChangeByNewLineNumber, findChangeByOldLineNumber, getChangeKey, Hunk, parseDiff, tokenize } from "react-diff-view";
import type { FileData, HunkData } from "react-diff-view";
import { refractor } from "refractor";
import jsxLang from "refractor/jsx";
import tsxLang from "refractor/tsx";
import { ChevronDown, ChevronRight, FileCode, Loader2, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerDoc } from "./QuestionDetailContext";
import PrLineAnswerThread from "./PrLineAnswerThread";
import PrLineAnswerForm from "./PrLineAnswerForm";
import "react-diff-view/style/index.css";

// react-diff-view's `refractor` typing needs `highlight` — the *common*
// refractor bundle (default export) already registers most languages
// (javascript, typescript, python, css, java, go, rust, ruby, php, bash,
// json, yaml, markdown…) but not jsx/tsx, which are extremely common in
// this app's own PRs. Register them once, defensively — if a given
// refractor build doesn't expose `.register`, or a language is already
// registered, this must never crash the diff viewer.
try {
    if (!refractor.registered?.("jsx")) refractor.register(jsxLang);
    if (!refractor.registered?.("tsx")) refractor.register(tsxLang);
} catch {
    // Highlighting is a nice-to-have — plain code rendering is the fallback.
}

const EXT_TO_LANGUAGE: Record<string, string> = {
    js: "javascript", mjs: "javascript", cjs: "javascript",
    jsx: "jsx",
    ts: "typescript",
    tsx: "tsx",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    c: "c",
    h: "c",
    cpp: "cpp", cc: "cpp", hpp: "cpp",
    php: "php",
    css: "css", scss: "css", less: "css",
    json: "json",
    md: "markdown",
    yml: "yaml", yaml: "yaml",
    sh: "bash", bash: "bash",
};

function languageForPath(path: string | undefined): string | null {
    if (!path) return null;
    const ext = path.split(".").pop()?.toLowerCase();
    if (!ext) return null;
    return EXT_TO_LANGUAGE[ext] ?? null;
}

/** Lines across all hunks in a file — used for the >200-line collapse rule. */
function totalChangedLines(hunks: HunkData[]): number {
    return hunks.reduce((sum, hunk) => sum + hunk.changes.length, 0);
}

export type SelectedDiffLine = { filePath: string; lineNumber: number; side: "left" | "right" };

/** Parses the JSON-encoded diffLineRef stored on an answer document. Returns null on any malformed/legacy value rather than throwing — a bad ref just means that answer doesn't render as a widget. */
function parseDiffLineRef(raw: string | null | undefined): SelectedDiffLine | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (
            typeof parsed?.filePath === "string" &&
            typeof parsed?.lineNumber === "number" &&
            (parsed?.side === "left" || parsed?.side === "right")
        ) {
            return parsed;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Reads/writes `#file=...&line=...` so a line-anchored answer is
 * deep-linkable (Phase 5). Kept as a small self-contained hook rather than
 * lifting into context — nothing else on the page needs this state yet.
 */
export function useSelectedDiffLineFromHash(): [
    SelectedDiffLine | null,
    (next: SelectedDiffLine | null) => void
] {
    const router = useRouter();
    const [selected, setSelected] = React.useState<SelectedDiffLine | null>(null);

    const parseHash = React.useCallback(() => {
        if (typeof window === "undefined") return null;
        const hash = window.location.hash.replace(/^#/, "");
        if (!hash) return null;
        const params = new URLSearchParams(hash);
        const filePath = params.get("file");
        const lineNumber = Number(params.get("line"));
        const side = params.get("side") === "left" ? "left" : "right";
        if (!filePath || !Number.isFinite(lineNumber)) return null;
        return { filePath, lineNumber, side } as SelectedDiffLine;
    }, []);

    React.useEffect(() => {
        setSelected(parseHash());
        const onHashChange = () => setSelected(parseHash());
        window.addEventListener("hashchange", onHashChange);
        return () => window.removeEventListener("hashchange", onHashChange);
    }, [parseHash]);

    const select = React.useCallback(
        (next: SelectedDiffLine | null) => {
            setSelected(next);
            const url = new URL(window.location.href);
            if (next) {
                url.hash = `file=${encodeURIComponent(next.filePath)}&line=${next.lineNumber}&side=${next.side}`;
            } else {
                url.hash = "";
            }
            router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
        },
        [router]
    );

    return [selected, select];
}

interface PrDiffViewerProps {
    diffFileId: string | null;
    questionId: string;
    selectedLine: SelectedDiffLine | null;
    onSelectLine: (line: SelectedDiffLine | null) => void;
    /** PR-Linked Q&A (Phase 6) — all answers on this question with a non-null diffLineRef. */
    lineAnchoredAnswers: AnswerDoc[];
    onParsed?: (files: FileData[]) => void;
}

const LARGE_FILE_LINE_THRESHOLD = 200;

export default function PrDiffViewer({
    diffFileId,
    questionId,
    selectedLine,
    onSelectLine,
    lineAnchoredAnswers,
    onParsed,
}: PrDiffViewerProps) {
    const router = useRouter();
    const [diffText, setDiffText] = React.useState<string | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);

    // ── diffFileId is null: diff hasn't landed yet — poll by refreshing
    // the (ISR-cached, but revalidated by FetchPrDiffProcessor once the
    // diff is stored) server component every 10s until it appears.
    React.useEffect(() => {
        if (diffFileId) return;
        const interval = setInterval(() => router.refresh(), 10_000);
        return () => clearInterval(interval);
    }, [diffFileId, router]);

    React.useEffect(() => {
        if (!diffFileId) {
            setDiffText(null);
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetch(`/api/pr-diff/${encodeURIComponent(diffFileId)}`)
            .then(async (res) => {
                if (!res.ok) throw new Error(`Failed to load diff (${res.status})`);
                return res.text();
            })
            .then((text) => {
                if (!cancelled) setDiffText(text);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || "Failed to load diff");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [diffFileId]);

    const files = React.useMemo(() => {
        if (!diffText) return [];
        try {
            return parseDiff(diffText);
        } catch {
            return null;
        }
    }, [diffText]);

    React.useEffect(() => {
        if (onParsed && files) onParsed(files);
    }, [files, onParsed]);

    if (!diffFileId) {
        return (
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-8 text-center">
                <Loader2 className="mx-auto size-5 animate-spin text-zinc-500" />
                <p className="mt-3 text-sm text-zinc-400">
                    Diff is being fetched, check back in a moment.
                </p>
            </div>
        );
    }

    if (loading && !diffText) {
        return <DiffSkeleton />;
    }

    if (error) {
        return (
            <div className="rounded-2xl border border-red-500/10 bg-red-400/5 p-6 text-sm text-red-200/80">
                Couldn&apos;t load the diff: {error}
            </div>
        );
    }

    if (!diffText) return null;

    if (files === null) {
        return (
            <div className="rounded-2xl border border-red-500/10 bg-red-400/5 p-6 text-sm text-red-200/80">
                This diff couldn&apos;t be parsed. It may be malformed or too unusual a format to render.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {files.map((file) => (
                <DiffFile
                    key={`${file.oldPath}-${file.newPath}`}
                    file={file}
                    questionId={questionId}
                    selectedLine={selectedLine}
                    onSelectLine={onSelectLine}
                    lineAnchoredAnswers={lineAnchoredAnswers}
                />
            ))}
        </div>
    );
}

function DiffFile({
    file,
    selectedLine,
    onSelectLine,
    lineAnchoredAnswers,
}: {
    file: FileData;
    questionId: string;
    selectedLine: SelectedDiffLine | null;
    onSelectLine: (line: SelectedDiffLine | null) => void;
    lineAnchoredAnswers: AnswerDoc[];
}) {
    const path = file.newPath !== "/dev/null" ? file.newPath : file.oldPath;
    const lineCount = totalChangedLines(file.hunks);
    const isLarge = lineCount > LARGE_FILE_LINE_THRESHOLD;
    const [expanded, setExpanded] = React.useState(!isLarge);

    const language = languageForPath(path);
    const tokens = React.useMemo(() => {
        if (!language) return undefined;
        try {
            return tokenize(file.hunks, {
                highlight: true,
                refractor: refractor as any,
                language,
            });
        } catch {
            // Unsupported/unregistered language for this file — fall back to
            // unhighlighted rendering rather than crashing the whole viewer.
            return undefined;
        }
    }, [file.hunks, language]);

    // ─── PR-Linked Q&A (Phase 6) ────────────────────────────────────────
    // Group this file's line-anchored answers by exact (lineNumber, side),
    // then resolve each group to a react-diff-view widget key via the
    // matching change record — a normal (unchanged) line only has one key
    // regardless of which side the anchor was recorded against, so an old-
    // side and new-side anchor pointing at the same unchanged line
    // legitimately collapse into the same thread.
    const widgets = React.useMemo(() => {
        const result: Record<string, React.ReactNode> = {};
        if (!path) return result;

        const answersForFile = lineAnchoredAnswers
            .map((answer) => ({ answer, ref: parseDiffLineRef(answer.diffLineRef) }))
            .filter((entry): entry is { answer: AnswerDoc; ref: SelectedDiffLine } =>
                Boolean(entry.ref) && entry.ref!.filePath === path
            );

        const grouped = new Map<string, AnswerDoc[]>();
        const keyFor = (ref: SelectedDiffLine) => {
            const change =
                ref.side === "right"
                    ? findChangeByNewLineNumber(file.hunks, ref.lineNumber)
                    : findChangeByOldLineNumber(file.hunks, ref.lineNumber);
            return change ? getChangeKey(change) : null;
        };

        for (const { answer, ref } of answersForFile) {
            const key = keyFor(ref);
            if (!key) continue; // Orphaned anchor (line no longer exists) — Phase 8 handles resurfacing these.
            grouped.set(key, [...(grouped.get(key) ?? []), answer]);
        }

        for (const [key, groupedAnswers] of Array.from(grouped.entries())) {
            result[key] = (
                <PrLineAnswerThread
                    answers={groupedAnswers}
                    onAddAnother={() => {
                        const ref = parseDiffLineRef(groupedAnswers[0].diffLineRef)!;
                        onSelectLine(ref);
                    }}
                />
            );
        }

        // The active "answer this line" form gets its own widget, merged
        // into (or appended after) any existing thread at the same key.
        if (selectedLine && selectedLine.filePath === path) {
            const change =
                selectedLine.side === "right"
                    ? findChangeByNewLineNumber(file.hunks, selectedLine.lineNumber)
                    : findChangeByOldLineNumber(file.hunks, selectedLine.lineNumber);
            if (change) {
                const key = getChangeKey(change);
                const lineContent = "content" in change ? change.content : "";
                const existingThread = result[key];
                result[key] = (
                    <>
                        {existingThread}
                        <PrLineAnswerForm
                            filePath={selectedLine.filePath}
                            lineNumber={selectedLine.lineNumber}
                            side={selectedLine.side}
                            lineContent={lineContent}
                            onDone={() => onSelectLine(null)}
                        />
                    </>
                );
            }
        }

        return result;
    }, [lineAnchoredAnswers, path, file.hunks, selectedLine, onSelectLine]);

    return (
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.015]">
            <button
                onClick={() => setExpanded((v) => !v)}
                className="flex w-full items-center gap-2.5 border-b border-white/5 bg-white/[0.03] px-4 py-3 text-left text-sm"
            >
                {expanded ? (
                    <ChevronDown className="size-4 shrink-0 text-zinc-500" />
                ) : (
                    <ChevronRight className="size-4 shrink-0 text-zinc-500" />
                )}
                <FileCode className="size-4 shrink-0 text-zinc-500" />
                <span className="truncate font-mono text-zinc-300">{path}</span>
                <span className="ml-auto shrink-0 text-xs text-zinc-600">
                    {lineCount} line{lineCount === 1 ? "" : "s"}
                    {isLarge && !expanded ? " · collapsed" : ""}
                </span>
            </button>

            {expanded && (
                <div className="diff-view-container overflow-x-auto text-[13px]">
                    <Diff
                        viewType="split"
                        diffType={file.type}
                        hunks={file.hunks}
                        tokens={tokens ?? null}
                        gutterType="anchor"
                        widgets={widgets}
                        gutterEvents={{
                            onClick: ({ change, side }) => {
                                if (!change || !path) return;
                                const lineNumber =
                                    "newLineNumber" in change && change.newLineNumber
                                        ? change.newLineNumber
                                        : "oldLineNumber" in change
                                        ? change.oldLineNumber
                                        : "lineNumber" in change
                                        ? (change as any).lineNumber
                                        : undefined;
                                if (!lineNumber) return;
                                const next: SelectedDiffLine = {
                                    filePath: path,
                                    lineNumber,
                                    side: side === "old" ? "left" : "right",
                                };
                                const isSame =
                                    selectedLine?.filePath === next.filePath &&
                                    selectedLine?.lineNumber === next.lineNumber &&
                                    selectedLine?.side === next.side;
                                onSelectLine(isSame ? null : next);
                            },
                        }}
                        renderGutter={({ change, side, renderDefault, wrapInAnchor }) => {
                            const lineNumber =
                                "newLineNumber" in change && change.newLineNumber
                                    ? change.newLineNumber
                                    : "oldLineNumber" in change
                                    ? change.oldLineNumber
                                    : undefined;
                            const isSelected =
                                selectedLine?.filePath === path &&
                                selectedLine?.lineNumber === lineNumber &&
                                selectedLine?.side === (side === "old" ? "left" : "right");
                            return wrapInAnchor(
                                <span
                                    className={cn(
                                        "group/gutter relative flex items-center justify-center",
                                        isSelected && "text-[#a7c8b3]"
                                    )}
                                >
                                    <Plus className="absolute left-0 size-3 opacity-0 transition group-hover/gutter:opacity-100" />
                                    {renderDefault()}
                                </span>
                            );
                        }}
                    >
                        {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
                    </Diff>
                </div>
            )}
        </div>
    );
}

function DiffSkeleton() {
    return (
        <div className="animate-pulse space-y-3">
            {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 rounded-2xl border border-white/5 bg-white/[0.03]" />
            ))}
        </div>
    );
}
