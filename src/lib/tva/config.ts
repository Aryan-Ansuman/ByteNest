// Test-Verified Answers — sandbox execution tunables.

// Self-hosted Piston instance is assumed to have jest/pytest installed into
// the relevant language images (vanilla Piston only ships bare runtimes).
// Falls back to the public Piston instance for local dev.
export const PISTON_API_URL =
  process.env.PISTON_API_URL ?? "https://emkc.org/api/v2/piston";

// Resource caps sent with every execute call — prevents a single submission
// from monopolizing the Piston quota or hanging the worker.
export const PISTON_RUN_TIMEOUT_MS = 10_000;
export const PISTON_COMPILE_TIMEOUT_MS = 10_000;
export const PISTON_RUN_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024; // 256MB

// Infra-failure retries (Piston unreachable/timed out) are capped tighter
// than the dispatcher's generic 5-attempt ceiling — a hung Piston instance
// shouldn't be allowed to pile up the queue with 5x retries per answer.
export const PISTON_MAX_RETRIES = 2;
