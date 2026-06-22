/**
 * Phase 9 — Edge Cases and Hardening
 *
 * Pure utility module consumed by the trajectory computation engine (Phase 4)
 * and the sparkline component (Phase 7). No database calls, fully testable.
 *
 * Steps covered:
 *   9.1  Neutral display copy for declining trajectory
 *   9.2  Soft y-axis cap for viral-spike weeks in the sparkline
 *   9.3  Zero-delta weeks as valid flat data points (not gaps)
 *   9.4  UTC-only weekly bucket boundaries
 *   9.5  Documented concurrency limitation for reputationAfter
 */

// ─────────────────────────────────────────────────────────────────────────────
// Step 9.1 — Neutral display copy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Technical trajectory labels used in the data model and API response.
 * These are never shown directly in the UI — see `trajectoryDisplayCopy`.
 */
export type TrajectoryDirection = "Climbing" | "Stable" | "Declining";

/**
 * Human-facing copy for each trajectory direction.
 *
 * Step 9.1: "Declining" is intentionally softened to "Lower activity recently"
 * so users with a downward trend are not made to feel penalised by the widget.
 * The technical label remains in the data model for analytics purposes.
 */
export const TRAJECTORY_DISPLAY: Record<
    TrajectoryDirection,
    { label: string; sublabel: string; color: string; arrowDirection: "up" | "right" | "down" }
> = {
    Climbing: {
        label:          "Climbing",
        sublabel:       "Your reputation is growing",
        color:          "text-emerald-400",
        arrowDirection: "up",
    },
    Stable: {
        label:          "Stable",
        sublabel:       "Consistent recent activity",
        color:          "text-zinc-400",
        arrowDirection: "right",
    },
    // Step 9.1 — softened copy; technical value "Declining" stays in the model
    Declining: {
        label:          "Lower activity recently",
        sublabel:       "Pick up where you left off",
        color:          "text-amber-400",
        arrowDirection: "down",
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// Step 9.2 — Soft y-axis cap for viral-spike weeks
// ─────────────────────────────────────────────────────────────────────────────

/** Multiplier above which a week's delta is considered a viral spike. */
const SPIKE_CAP_MULTIPLIER = 5;

export interface WeeklyBucket {
    /** ISO label for this week, e.g. "Week of Jun 9" */
    weekLabel:    string;
    /** Raw sum of all reputation deltas in this week (Step 9.3: can be 0). */
    delta:        number;
    /**
     * Value used for rendering the sparkline y-position.
     * Equals `delta` normally; capped at `spikeCapValue` for viral weeks.
     * Step 9.2.
     */
    displayDelta: number;
    /**
     * True when this week was capped. The sparkline renders a hover tooltip
     * showing `delta` (the real value) when this flag is set.
     */
    isCapped:     boolean;
    /** The cap ceiling applied when isCapped is true, otherwise undefined. */
    capCeiling?:  number;
}

/**
 * Compute the median of a numeric array.
 * Uses the lower-median for even-length arrays (standard convention).
 */
function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid    = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Apply the viral-spike soft cap to a set of weekly buckets.
 *
 * Step 9.2: If any single week's delta exceeds 5× the median weekly delta,
 * its `displayDelta` is capped at 5× the median. The raw `delta` is preserved
 * so the tooltip can show the actual value. `isCapped` is set to true so the
 * sparkline component knows to render the spike indicator.
 *
 * Step 9.3: Zero-delta weeks are included unchanged — they produce a flat
 * segment in the sparkline, not a gap.
 *
 * @param buckets  Raw weekly buckets from the trajectory engine.
 * @returns        The same buckets with `displayDelta`, `isCapped`, and
 *                 `capCeiling` populated.
 */
export function applySpikeCap(buckets: Omit<WeeklyBucket, "displayDelta" | "isCapped" | "capCeiling">[]): WeeklyBucket[] {
    if (buckets.length === 0) return [];

    // Only consider positive deltas for the median — negative weeks (net
    // downvotes) should not drag the cap ceiling down to near zero.
    const positiveDeltas = buckets
        .map((b) => b.delta)
        .filter((d) => d > 0);

    const medianDelta = median(positiveDeltas);
    const capCeiling  = medianDelta * SPIKE_CAP_MULTIPLIER;

    return buckets.map((bucket) => {
        // Step 9.3: zero deltas pass through unchanged — valid flat points
        if (bucket.delta <= 0 || medianDelta === 0) {
            return { ...bucket, displayDelta: bucket.delta, isCapped: false };
        }

        const isCapped = bucket.delta > capCeiling;
        return {
            ...bucket,
            displayDelta: isCapped ? capCeiling : bucket.delta,
            isCapped,
            capCeiling: isCapped ? capCeiling : undefined,
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 9.3 + 9.4 — UTC weekly bucket builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A reputation event as stored in the database.
 * Only the fields needed for bucketing are required here.
 */
export interface ReputationEventForBucketing {
    delta:       number;
    createdAt:   string; // ISO 8601 UTC — Appwrite stores all timestamps in UTC
    isSynthetic: boolean;
}

/**
 * Return the UTC Monday midnight timestamp (ms) that starts the ISO week
 * containing the given date.
 *
 * Step 9.4: All arithmetic is done in UTC to guarantee that the same event
 * always falls in the same bucket regardless of where the server runs.
 */
function getUTCWeekStart(date: Date): number {
    const d = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    );
    // ISO weeks start on Monday (day 1). Sunday is day 0, shift it to 7.
    const dayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (dayOfWeek - 1));
    return d.getTime();
}

/**
 * Format a UTC week-start timestamp as a human-readable label.
 * Example: "Jun 9" for the week starting 2025-06-09.
 */
function formatWeekLabel(weekStartMs: number): string {
    return new Date(weekStartMs).toLocaleDateString("en-US", {
        month:    "short",
        day:      "numeric",
        timeZone: "UTC", // Step 9.4: always UTC
    });
}

/**
 * Build 8 consecutive weekly buckets going back from the current UTC week,
 * sum the reputation deltas from the provided events into each bucket, and
 * return them oldest-first (left → right on the sparkline).
 *
 * Step 9.3: Weeks with no matching events get delta = 0 — they are never
 * omitted. The sparkline renders a flat segment for those weeks.
 *
 * Step 9.4: Bucket boundaries are computed in pure UTC.
 *
 * @param events         Real (non-synthetic) reputation events, any order.
 * @param weeksBack      How many weekly buckets to produce. Default: 8.
 * @param referenceDate  Inject a custom "now" for unit testing.
 */
export function buildWeeklyBuckets(
    events: ReputationEventForBucketing[],
    weeksBack = 8,
    referenceDate: Date = new Date()
): Omit<WeeklyBucket, "displayDelta" | "isCapped" | "capCeiling">[] {
    // Step 9.4: derive this week's Monday in UTC
    const thisWeekStart = getUTCWeekStart(referenceDate);
    const ONE_WEEK_MS   = 7 * 24 * 60 * 60 * 1000;

    // Build bucket boundaries oldest → newest
    const bucketStarts: number[] = [];
    for (let i = weeksBack - 1; i >= 0; i--) {
        bucketStarts.push(thisWeekStart - i * ONE_WEEK_MS);
    }

    // Sum deltas per bucket
    const deltaSums = new Array<number>(weeksBack).fill(0); // Step 9.3: default 0

    for (const event of events) {
        // Step 9.2 contract: caller is responsible for filtering out synthetic
        // events before passing them here, but guard defensively.
        if (event.isSynthetic) continue;

        // Step 9.4: parse as UTC — Appwrite ISO strings are already UTC
        const eventTime      = new Date(event.createdAt).getTime();
        const eventWeekStart = getUTCWeekStart(new Date(event.createdAt));

        // Binary-search equivalent: find which bucket this event belongs to
        for (let i = bucketStarts.length - 1; i >= 0; i--) {
            if (eventWeekStart >= bucketStarts[i]) {
                deltaSums[i] += event.delta;
                break;
            }
        }
    }

    return bucketStarts.map((start, i) => ({
        weekLabel: formatWeekLabel(start),
        delta:     deltaSums[i], // 0 for weeks with no activity (Step 9.3)
    }));
}

/**
 * Convenience: build buckets AND apply the spike cap in one call.
 * This is what Phase 7 (the sparkline component) should call.
 *
 * Steps 9.2 + 9.3 + 9.4 combined.
 */
export function buildSparklineData(
    events: ReputationEventForBucketing[],
    weeksBack = 8,
    referenceDate: Date = new Date()
): WeeklyBucket[] {
    const raw = buildWeeklyBuckets(events, weeksBack, referenceDate);
    return applySpikeCap(raw);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 9.5 — Concurrency documentation (runtime guard + type export)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known limitation documented per Step 9.5:
 *
 * When a user receives multiple upvotes simultaneously (e.g. a viral answer),
 * multiple `writeReputationEvent` calls execute concurrently. The event log
 * itself is safe — each write is independent and append-only, so there is no
 * race condition on the `reputation_events` collection.
 *
 * However, the `reputationAfter` field on concurrent events may be briefly
 * incorrect because each call reads `user.prefs.reputation`, computes
 * `current + delta`, and writes back. Under concurrency:
 *
 *   Call A reads rep = 100, writes rep = 105, stores reputationAfter = 105
 *   Call B reads rep = 100, writes rep = 105, stores reputationAfter = 105
 *   Actual final rep = 110  (Appwrite last-write-wins on prefs)
 *
 * The event log will show two events both claiming reputationAfter = 105,
 * but the true value is 110. The discrepancy is detected by
 * `verifyReputationAfter` in `write-reputation-event.ts` which logs a warning.
 *
 * Resolution: the reputation integer in `user.prefs` is always authoritative.
 * The `reputationAfter` field in the event log is a convenience denormalization
 * and may lag by one event under burst conditions. Trajectory computation in
 * Phase 4 uses `sum(delta)` rather than trusting `reputationAfter`, so the
 * analytics are unaffected by this limitation.
 *
 * A future improvement would be to use a distributed counter (e.g. Appwrite
 * atomic integer update) instead of read-modify-write on user prefs, but that
 * requires schema changes outside this feature's scope.
 */
export const CONCURRENCY_LIMITATION = `
reputationAfter may transiently show stale values under concurrent writes.
The event log deltas are always correct. Trajectory computation uses sum(delta).
See Phase 9 Step 9.5 in the development roadmap for full details.
`.trim();

/**
 * Type guard: returns true if a `reputationAfter` value on an event is
 * potentially stale due to concurrency. Used in the Phase 5 health-check
 * endpoint to surface warnings without blocking the response.
 *
 * A value is flagged as potentially stale when the difference between
 * `reputationAfter` on consecutive events exceeds what a single delta
 * could account for — which only happens when writes raced.
 */
export function detectConcurrentWriteSkew(
    events: Array<{ delta: number; reputationAfter: number }>
): boolean {
    if (events.length < 2) return false;

    // Events must be in chronological order for this check to be meaningful
    for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1];
        const curr = events[i];
        const expectedAfter = prev.reputationAfter + curr.delta;
        if (expectedAfter !== curr.reputationAfter) {
            return true; // reputationAfter skew detected
        }
    }
    return false;
}
