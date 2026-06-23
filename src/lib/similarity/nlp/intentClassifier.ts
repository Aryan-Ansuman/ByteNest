/**
 * Step 2.3 — Rule-based intent classifier.
 * Five intent categories: Conceptual, Procedural, Debugging, Comparative, Architectural.
 * No external API call — fast, transparent, explainable.
 * Returns label + confidence score (0.0–1.0).
 * Confidence below UNCERTAIN_THRESHOLD excludes intent from hybrid ranking formula.
 */

export type IntentLabel =
  | "conceptual"
  | "procedural"
  | "debugging"
  | "comparative"
  | "architectural"
  | "uncertain";

export type IntentClassification = {
  label: IntentLabel;
  confidence: number;
  matchedSignals: string[];
  isUncertain: boolean;
};

export const UNCERTAIN_THRESHOLD = 0.4;

// ─── Signal dictionaries ──────────────────────────────────────────────────────

type IntentSignals = {
  label: Exclude<IntentLabel, "uncertain">;
  patterns: RegExp[];
};

const INTENT_RULES: IntentSignals[] = [
  {
    label: "debugging",
    patterns: [
      /\bnot\s+working\b/i,
      /\bbroken\b/i,
      /\berror\b/i,
      /\bexception\b/i,
      /\bfails?\b/i,
      /\bfailing\b/i,
      /\bcrash(es|ing)?\b/i,
      /\bwhy\s+(is|does|won'?t|doesn'?t)\b/i,
      /\bcan'?t\b/i,
      /\bundefined\b/i,
      /\bnull\s+pointer\b/i,
      /\btypeerror\b/i,
    ],
  },
  {
    label: "comparative",
    patterns: [
      /\bvs\.?\b/i,
      /\bversus\b/i,
      /\bdifference\s+between\b/i,
      /\bbetter\b/i,
      /\bwhich\s+(is|should|to)\b/i,
      /\bwhen\s+to\s+use\b/i,
      /\bover\b.*\bor\b/i,
      /\bpros?\s+and\s+cons?\b/i,
      /\bcompare\b/i,
    ],
  },
  {
    label: "architectural",
    patterns: [
      /\bdesign\b/i,
      /\barchitect(ure)?\b/i,
      /\bbest\s+(approach|practice|way|pattern)\b/i,
      /\bpattern\b/i,
      /\bstructure\b/i,
      /\borganize\b/i,
      /\bscalab(le|ility)\b/i,
      /\bsystem\s+design\b/i,
    ],
  },
  {
    label: "procedural",
    patterns: [
      /\bhow\s+to\b/i,
      /\bsteps?\s+to\b/i,
      /\bimplement(ation)?\b/i,
      /\bset\s*up\b/i,
      /\bcreate\b/i,
      /\bbuild\b/i,
      /\bconfigure\b/i,
      /\binstall\b/i,
      /\badd\b/i,
      /\bfetch\b/i,
      /\bintegrate\b/i,
    ],
  },
  {
    label: "conceptual",
    patterns: [
      /\bhow\s+does\b/i,
      /\bwhat\s+is\b/i,
      /\bwhat\s+are\b/i,
      /\bexplain\b/i,
      /\bunderstand\b/i,
      /\bmeaning\b/i,
      /\bconcept\b/i,
      /\bwhy\s+does\b/i,
    ],
  },
];

// ─── Classifier ───────────────────────────────────────────────────────────────

type RawScore = {
  label: Exclude<IntentLabel, "uncertain">;
  matchCount: number;
  matchedSignals: string[];
  totalSignals: number;
};

export function classifyIntent(title: string): IntentClassification {
  const scores: RawScore[] = INTENT_RULES.map((rule) => {
    const matched: string[] = [];

    for (const pattern of rule.patterns) {
      const m = title.match(pattern);
      if (m) matched.push(m[0]);
    }

    return {
      label: rule.label,
      matchCount: matched.length,
      matchedSignals: matched,
      totalSignals: rule.patterns.length,
    };
  });

  // Sort descending by match count
  scores.sort((a, b) => b.matchCount - a.matchCount);

  const top = scores[0];

  // No signals matched at all
  if (top.matchCount === 0) {
    return {
      label: "uncertain",
      confidence: 0.0,
      matchedSignals: [],
      isUncertain: true,
    };
  }

  // Confidence = matched signals / total signals in winning category
  const confidence = parseFloat(
    (top.matchCount / top.totalSignals).toFixed(4)
  );

  const isUncertain = confidence < UNCERTAIN_THRESHOLD;

  return {
    label: isUncertain ? "uncertain" : top.label,
    confidence,
    matchedSignals: top.matchedSignals,
    isUncertain,
  };
}

// ─── Intent similarity (used in Stage 2 hybrid formula) ──────────────────────

/**
 * Returns intent similarity score for two classified questions.
 * Binary with confidence modifier per Step 2.3.
 * Returns null when either classification is uncertain — caller excludes from formula.
 */
export function computeIntentSimilarity(
  a: IntentClassification,
  b: IntentClassification
): number | null {
  if (a.isUncertain || b.isUncertain) return null;
  if (a.label !== b.label) return 0.0;
  return Math.min(a.confidence, b.confidence);
}
