/**
 * Answer Gap Detector — Phase 8: Observability
 *
 * Step 8.1 — Cache hit/miss logging.
 *
 * Every GET /api/answer-gaps request logs whether it was served from cache
 * or required a fresh query. A lightweight in-process counter tracks the
 * rolling hit rate so a sustained drop below 70% surfaces as a warning in
 * server logs — signalling the TTL may be too short or the widget is
 * re-mounting more often than expected.
 *
 * The counter is per-process and resets on cold start / redeploy — it's a
 * debugging aid, not a durable metric. Route these log lines to your
 * platform's log aggregator / APM for cross-instance visibility.
 */

const HIT_RATE_WARNING_THRESHOLD = 0.7;
const MIN_SAMPLES_BEFORE_WARNING = 20;

let hitCount = 0;
let missCount = 0;

export type CacheOutcome = "HIT" | "MISS";

export function logCacheOutcome(userId: string, outcome: CacheOutcome): void {
    if (outcome === "HIT") hitCount++;
    else missCount++;

    const total = hitCount + missCount;
    const hitRate = total > 0 ? hitCount / total : 0;

    console.log(
        `[answer-gaps:cache] outcome=${outcome} userId=${userId} ` +
        `runningHitRate=${(hitRate * 100).toFixed(1)}% (${hitCount}/${total})`
    );

    if (total >= MIN_SAMPLES_BEFORE_WARNING && hitRate < HIT_RATE_WARNING_THRESHOLD) {
        console.warn(
            `[answer-gaps:cache] WARNING — hit rate ${(hitRate * 100).toFixed(1)}% is below the ` +
            `${(HIT_RATE_WARNING_THRESHOLD * 100).toFixed(0)}% threshold over the last ${total} requests. ` +
            `TTL may be too short, or the widget may be re-mounting more often than expected.`
        );
    }
}

/** Exposed for tests / manual resets. */
export function resetCacheOutcomeCounters(): void {
    hitCount = 0;
    missCount = 0;
}
