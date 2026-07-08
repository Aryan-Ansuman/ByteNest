// Pure, framework-agnostic helpers — safe to import from both server routes
// and client components (PrQuestionView / OrphanedAnswersSection).

export type DiffLineSide = "left" | "right";

export type DiffLineRef = {
    filePath: string;
    lineNumber: number;
    side: DiffLineSide;
};

// Minimal shape compatible with react-diff-view's parseDiff() output —
// only the fields this module actually reads.
export type ParsedDiffHunk = {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
};

export type ParsedDiffFile = {
    oldPath: string;
    newPath: string;
    hunks: ParsedDiffHunk[];
};

/** Safely parses an answer's stored `diffLineRef` JSON string. Returns null on malformed data. */
export function parseDiffLineRef(raw: string | null | undefined): DiffLineRef | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (
            typeof parsed?.filePath === "string" &&
            typeof parsed?.lineNumber === "number" &&
            (parsed?.side === "left" || parsed?.side === "right")
        ) {
            return parsed as DiffLineRef;
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * True if `ref` no longer points at a line that exists in the current
 * (post-refresh) diff — i.e. the file was renamed/removed, or the line
 * fell outside every hunk's range. `diffLineContext` (stored on the answer)
 * remains the fallback for what the answer is actually about.
 */
export function isDiffLineOrphaned(ref: DiffLineRef, files: ParsedDiffFile[]): boolean {
    const file = files.find((f) => f.newPath === ref.filePath || f.oldPath === ref.filePath);
    if (!file) return true;

    return !file.hunks.some((hunk) => {
        const start = ref.side === "left" ? hunk.oldStart : hunk.newStart;
        const count = ref.side === "left" ? hunk.oldLines : hunk.newLines;
        return ref.lineNumber >= start && ref.lineNumber < start + count;
    });
}

export type AnswerWithDiffRef = {
    $id: string;
    diffLineRef: string | null;
};

export type PartitionedAnswers<T extends AnswerWithDiffRef> = {
    anchored: T[];   // valid line-anchored answers — render as diff widgets
    orphaned: T[];   // line-anchored, but the line no longer exists — render in the orphaned section
    general: T[];    // never line-anchored — render in the normal answer list
};

/**
 * Splits a question's answers into the three buckets PrQuestionView needs to
 * render: still-valid diff widgets, orphaned (diff changed underneath them),
 * and general (never anchored). Malformed `diffLineRef` values are treated
 * as orphaned rather than dropped, so a broken anchor never silently hides
 * an answer.
 */
export function partitionAnswersByDiffState<T extends AnswerWithDiffRef>(
    answers: T[],
    currentDiffFiles: ParsedDiffFile[]
): PartitionedAnswers<T> {
    const anchored: T[] = [];
    const orphaned: T[] = [];
    const general: T[] = [];

    for (const answer of answers) {
        const ref = parseDiffLineRef(answer.diffLineRef);
        if (!ref) {
            general.push(answer);
            continue;
        }
        if (isDiffLineOrphaned(ref, currentDiffFiles)) {
            orphaned.push(answer);
        } else {
            anchored.push(answer);
        }
    }

    return { anchored, orphaned, general };
}
