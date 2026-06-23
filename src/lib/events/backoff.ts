/**
 * Exponential backoff schedule for EmbeddingFailed retry.
 * Attempt 1 → 30s, 2 → 2m, 3 → 8m, 4 → 32m, 5+ → permanently failed.
 */
const BACKOFF_SCHEDULE_MS = [
  30_000,       // attempt 1
  120_000,      // attempt 2
  480_000,      // attempt 3
  1_920_000,    // attempt 4
];

export function getNextRetryAt(retryCount: number): string | null {
  const delayMs = BACKOFF_SCHEDULE_MS[retryCount - 1];
  if (!delayMs) return null; // 5th attempt — permanently failed
  return new Date(Date.now() + delayMs).toISOString();
}

export function getBackoffDelayMs(retryCount: number): number | null {
  return BACKOFF_SCHEDULE_MS[retryCount - 1] ?? null;
}
