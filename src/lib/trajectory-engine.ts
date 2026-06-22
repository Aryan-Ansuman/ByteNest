/**
 * Reputation Trajectory — Phase 4: Computation Engine
 *
 * Pure functions — no database calls, fully testable in isolation.
 * Takes an array of reputation events and returns the full trajectory payload
 * that the API endpoint (Phase 5) will return to the client.
 */

import {
    TrajectoryDirection,
    WeeklyBucket,
    buildSparklineData,
    ReputationEventForBucketing
} from "./reputation-trajectory-hardening";

export type { TrajectoryDirection, WeeklyBucket };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReputationEvent extends ReputationEventForBucketing {
    $id:             string;
    userId:          string;
    reputationAfter: number;
}

export interface TrajectoryResult {
    /** 8 weekly buckets, index 0 = oldest, index 7 = current partial week. */
    weeklyBuckets:              WeeklyBucket[];
    trajectory:                 TrajectoryDirection;
    /** Average weekly gain over the trailing 4 complete weeks. */
    velocity:                   number;
    /** current + velocity × 4.3  — null when insufficient data. */
    projection30d:              number | null;
    /** Number of consecutive weeks ending now with ≥1 positive event. */
    streakWeeks:                number;
    hasEnoughDataForProjection: boolean;
    /** True when the real-event set is empty (new user or no activity). */
    noData:                     boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BUCKET_COUNT = 8;
const RECENT_WEEKS = 4;
const TRAJECTORY_THRESHOLD = 0.10;
const MIN_EVENTS_FOR_PROJECTION = 3;
const PROJECTION_WEEKS = 4.3;
export const STREAK_LABEL_THRESHOLD = 4;

// ─── Step 4.2: Trajectory direction ──────────────────────────────────────────

function computeTrajectory(buckets: WeeklyBucket[]): TrajectoryDirection {
    const priorSum  = buckets.slice(0, RECENT_WEEKS).reduce((s, b) => s + b.delta, 0);
    const recentSum = buckets.slice(RECENT_WEEKS).reduce((s, b) => s + b.delta, 0);

    if (priorSum === 0 && recentSum === 0) return "Stable";

    if (priorSum === 0) {
        return recentSum > 0 ? "Climbing" : "Declining";
    }

    const ratio = recentSum / Math.abs(priorSum);

    if (ratio > 1 + TRAJECTORY_THRESHOLD) return "Climbing";
    if (ratio < 1 - TRAJECTORY_THRESHOLD) return "Declining";
    return "Stable";
}

// ─── Step 4.3: Velocity ───────────────────────────────────────────────────────

function computeVelocity(buckets: WeeklyBucket[]): number {
    const completeWeeks = buckets.slice(RECENT_WEEKS - 1, BUCKET_COUNT - 1);
    const total = completeWeeks.reduce((s, b) => s + b.delta, 0);
    return total / completeWeeks.length;
}

// ─── Step 4.4: 30-day projection ─────────────────────────────────────────────

function computeProjection(
    currentReputation: number,
    velocity:          number,
    hasEnough:         boolean
): number | null {
    if (!hasEnough) return null;
    return Math.round(currentReputation + velocity * PROJECTION_WEEKS);
}

// ─── Step 4.5: Sparse activity guard ─────────────────────────────────────────

function hasEnoughDataForProjection(realEvents: ReputationEvent[]): boolean {
    return realEvents.length >= MIN_EVENTS_FOR_PROJECTION;
}

// ─── Step 4.6: Streak signal ──────────────────────────────────────────────────

function computeStreakWeeks(buckets: WeeklyBucket[], events: ReputationEvent[], referenceDate: Date): number {
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const d = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
    const dayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (dayOfWeek - 1));
    const thisWeekStart = d.getTime();

    const bucketStarts: number[] = [];
    for (let i = BUCKET_COUNT - 1; i >= 0; i--) {
        bucketStarts.push(thisWeekStart - i * ONE_WEEK_MS);
    }

    const positiveBuckets = new Set<number>();
    for (const event of events) {
        if (event.delta <= 0 || event.isSynthetic) continue;
        const ed = new Date(event.createdAt);
        const ew = new Date(Date.UTC(ed.getUTCFullYear(), ed.getUTCMonth(), ed.getUTCDate()));
        const eday = ew.getUTCDay() === 0 ? 7 : ew.getUTCDay();
        ew.setUTCDate(ew.getUTCDate() - (eday - 1));
        const eventWeekStart = ew.getTime();

        for (let i = bucketStarts.length - 1; i >= 0; i--) {
            if (eventWeekStart >= bucketStarts[i]) {
                positiveBuckets.add(i);
                break;
            }
        }
    }

    let streak = 0;
    for (let i = buckets.length - 1; i >= 0; i--) {
        if (positiveBuckets.has(i)) streak++;
        else break;
    }
    return streak;
}

// ─── Main export: computeTrajectory ──────────────────────────────────────────

export function computeReputationTrajectory(
    realEvents:        ReputationEvent[],
    currentReputation: number,
    referenceDate:     Date = new Date()
): TrajectoryResult {
    // ── No real events at all ─────────────────────────────────────────────────
    if (realEvents.length === 0) {
        const emptyBuckets = buildSparklineData([], BUCKET_COUNT, referenceDate);
        return {
            weeklyBuckets:              emptyBuckets,
            trajectory:                 "Stable",
            velocity:                   0,
            projection30d:              null,
            streakWeeks:                0,
            hasEnoughDataForProjection: false,
            noData:                     true,
        };
    }

    // ── Build and fill buckets using Phase 9 hardening ────────────────────────
    const filledBuckets = buildSparklineData(realEvents, BUCKET_COUNT, referenceDate);

    // ── Trajectory, velocity, projection ─────────────────────────────────────
    const trajectory  = computeTrajectory(filledBuckets);
    const velocity    = computeVelocity(filledBuckets);
    const hasEnough   = hasEnoughDataForProjection(realEvents);
    const projection  = computeProjection(currentReputation, velocity, hasEnough);
    const streak      = computeStreakWeeks(filledBuckets, realEvents, referenceDate);

    return {
        weeklyBuckets:              filledBuckets,
        trajectory,
        velocity:                   Math.round(velocity * 10) / 10,
        projection30d:              projection,
        streakWeeks:                streak,
        hasEnoughDataForProjection: hasEnough,
        noData:                     false,
    };
}

export function isConsistentContributor(streakWeeks: number): boolean {
    return streakWeeks >= STREAK_LABEL_THRESHOLD;
}
