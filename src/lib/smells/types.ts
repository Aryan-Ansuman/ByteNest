import type { CanonicalLanguage, ConfidenceLevel } from "./catalog";

// Decision 1 — the extraction contract. Phase 2 (extraction module) must
// produce exactly this shape; Phase 3 (rule engine) consumes exactly this
// shape. Changing this type means touching both.
export type ExtractedCodeBlock = {
  language: CanonicalLanguage;
  rawCode: string;
  lineStart: number;
  lineEnd: number;
  // Whether `language` came from an explicit fence hint or was inferred
  // from content — a smell found in inferred-language code is downgraded
  // one confidence level versus the same smell in explicitly-declared code.
  languageConfidence: "explicit" | "inferred";
};

export type SmellEvidence = {
  smell: string; // SmellId, kept as plain string here to avoid a circular import with catalog.ts's SmellId type in JSON-serialized contexts
  confidence: ConfidenceLevel;
  triggeredBy: string; // the specific pattern/line that matched
  lineNumbers: number[];
  snippet: string; // 3-5 lines of context around the trigger, for the UI panel
  source: "pattern" | "llm"; // which stage produced this — Phase 5 adds "llm"
};

export type SmellFeedbackTally = {
  correct: number;
  incorrect: number;
  autoRemoved?: boolean;
};

export type SmellFeedbackSummary = Record<string, SmellFeedbackTally>;
