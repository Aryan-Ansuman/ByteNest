// Code Smell Auto-Tagger — Decision 4, the frozen smell catalog.
//
// Every later phase (rule engine, systemTags values, UI display-name map,
// smell_feedback rows) references these identifiers by exact string.
// Adding a smell later is safe (append to the array); renaming or removing
// one is not — it invalidates every question's stored systemTags/evidence
// that reference the old string. Treat this file as append-only.

export const CANONICAL_LANGUAGES = ["javascript", "typescript", "python", "shell", "generic"] as const;
export type CanonicalLanguage = (typeof CANONICAL_LANGUAGES)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const SMELL_ANALYSIS_STATUSES = ["pending", "processing", "complete", "failed", "skipped"] as const;
export type SmellAnalysisStatus = (typeof SMELL_ANALYSIS_STATUSES)[number];

export type SmellDefinition = {
  id: string;
  displayName: string;
  description: string; // shown in the UI tooltip / smell panel
  applicableTo: CanonicalLanguage[] | ["all"];
  defaultConfidenceIfTriggered: ConfidenceLevel;
};

// ─── Language-agnostic ──────────────────────────────────────────────────
const LANGUAGE_AGNOSTIC: SmellDefinition[] = [
  { id: "n+1-query", displayName: "N+1 Query", description: "A database or HTTP call appears inside a loop, likely firing once per iteration instead of batching.", applicableTo: ["all"], defaultConfidenceIfTriggered: "high" },
  { id: "missing-error-handling", displayName: "Missing Error Handling", description: "An operation that can fail (network call, parse, file I/O) has no surrounding error handling.", applicableTo: ["all"], defaultConfidenceIfTriggered: "medium" },
  { id: "blocking-main-thread", displayName: "Blocking Main Thread", description: "A synchronous, potentially slow operation runs where it would block the main/UI thread.", applicableTo: ["all"], defaultConfidenceIfTriggered: "medium" },
  { id: "deep-nesting", displayName: "Deep Nesting", description: "Control flow is nested beyond a readable depth, often a sign the function is doing too much.", applicableTo: ["all"], defaultConfidenceIfTriggered: "high" },
  { id: "god-function", displayName: "God Function", description: "A single function is unusually long and handles many unrelated responsibilities.", applicableTo: ["all"], defaultConfidenceIfTriggered: "medium" },
  { id: "debug-code-left", displayName: "Debug Code Left In", description: "Console/print/debugger statements appear to be leftover debugging artifacts.", applicableTo: ["all"], defaultConfidenceIfTriggered: "high" },
  { id: "magic-numbers", displayName: "Magic Numbers", description: "Unexplained numeric literals control behavior instead of named constants.", applicableTo: ["all"], defaultConfidenceIfTriggered: "low" },
  { id: "sql-in-loop", displayName: "SQL In Loop", description: "A raw SQL statement is constructed or executed inside a loop.", applicableTo: ["all"], defaultConfidenceIfTriggered: "high" },
  { id: "select-star", displayName: "SELECT *", description: "A query selects all columns instead of the ones actually needed.", applicableTo: ["all"], defaultConfidenceIfTriggered: "high" },
];

// ─── JavaScript / TypeScript specific ───────────────────────────────────
const JS_TS_SPECIFIC: SmellDefinition[] = [
  { id: "memory-leak-risk", displayName: "Memory Leak Risk", description: "An event listener, interval, or subscription appears to be set up without a corresponding cleanup.", applicableTo: ["javascript", "typescript"], defaultConfidenceIfTriggered: "medium" },
  { id: "promise-not-awaited", displayName: "Promise Not Awaited", description: "A Promise-returning call is invoked without await or a .then/.catch handler.", applicableTo: ["javascript", "typescript"], defaultConfidenceIfTriggered: "high" },
  { id: "implicit-any", displayName: "Implicit Any", description: "TypeScript code relies on implicit any typing, losing type safety.", applicableTo: ["typescript"], defaultConfidenceIfTriggered: "low" },
  { id: "synchronous-loop-in-async", displayName: "Synchronous Loop In Async", description: "An async function contains a loop that runs its async work sequentially where it could be parallelized.", applicableTo: ["javascript", "typescript"], defaultConfidenceIfTriggered: "medium" },
];

// ─── Python specific ─────────────────────────────────────────────────────
const PYTHON_SPECIFIC: SmellDefinition[] = [
  { id: "bare-except", displayName: "Bare Except", description: "A bare `except:` clause silently catches every exception, including ones that should propagate.", applicableTo: ["python"], defaultConfidenceIfTriggered: "high" },
  { id: "mutable-default-argument", displayName: "Mutable Default Argument", description: "A function default argument is a mutable object (list/dict), a classic Python footgun.", applicableTo: ["python"], defaultConfidenceIfTriggered: "high" },
  { id: "global-state-mutation", displayName: "Global State Mutation", description: "A function mutates module-level global state, making behavior hard to reason about.", applicableTo: ["python"], defaultConfidenceIfTriggered: "medium" },
  { id: "string-concatenation-in-loop", displayName: "String Concatenation In Loop", description: "Strings are concatenated with + inside a loop instead of using join, which is quadratic.", applicableTo: ["python"], defaultConfidenceIfTriggered: "medium" },
];

export const SMELL_CATALOG: SmellDefinition[] = [
  ...LANGUAGE_AGNOSTIC,
  ...JS_TS_SPECIFIC,
  ...PYTHON_SPECIFIC,
];

export const SMELL_IDS = SMELL_CATALOG.map((s) => s.id);
export type SmellId = (typeof SMELL_CATALOG)[number]["id"];

export function getSmellDefinition(id: string): SmellDefinition | undefined {
  return SMELL_CATALOG.find((s) => s.id === id);
}

export function isKnownSmellId(id: string): boolean {
  return SMELL_IDS.includes(id);
}
