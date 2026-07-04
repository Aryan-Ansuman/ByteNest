import type { CanonicalLanguage } from "./catalog";

type InferenceRule = { pattern: RegExp; weight: number };

// Scored, not first-match — a snippet can legitimately contain overlapping
// tokens (e.g. TypeScript code matches plenty of plain-JS patterns too).
// TypeScript-specific patterns are weighted heaviest so TS code doesn't get
// misclassified as plain JS just because it also uses const/let/=>.
const PYTHON_RULES: InferenceRule[] = [
  { pattern: /^\s*def\s+\w+\s*\(/m, weight: 2 },
  { pattern: /^\s*import\s+\w+/m, weight: 1 },
  { pattern: /^\s*from\s+\w+\s+import\s+/m, weight: 2 },
  { pattern: /\bprint\(/, weight: 1 },
  { pattern: /^\s*class\s+\w+.*:\s*$/m, weight: 1 },
  { pattern: /:\s*$/m, weight: 0.5 }, // trailing colon block openers (if/for/while/def)
];

const TYPESCRIPT_RULES: InferenceRule[] = [
  { pattern: /:\s*(string|number|boolean|any|void|unknown)\b/, weight: 2 },
  { pattern: /\binterface\s+\w+/, weight: 2 },
  { pattern: /\btype\s+\w+\s*=/, weight: 2 },
  { pattern: /<\w+>\(/, weight: 1 }, // generic function call
];

const JAVASCRIPT_RULES: InferenceRule[] = [
  { pattern: /\bconst\s+\w+\s*=/, weight: 1 },
  { pattern: /\blet\s+\w+\s*=/, weight: 1 },
  { pattern: /\bfunction\s*\w*\s*\(/, weight: 1 },
  { pattern: /=>/, weight: 1 },
  { pattern: /\.then\(/, weight: 1 },
  { pattern: /\brequire\(/, weight: 1 },
];

const SHELL_RULES: InferenceRule[] = [
  { pattern: /^#!\/bin\/(ba)?sh/m, weight: 3 },
  { pattern: /^\s*(npm|yarn|pnpm|git|cd|ls|mkdir|export)\s+/m, weight: 1 },
  { pattern: /\$\{?\w+\}?/, weight: 0.5 },
];

function score(code: string, rules: InferenceRule[]): number {
  return rules.reduce((sum, { pattern, weight }) => (pattern.test(code) ? sum + weight : sum), 0);
}

/**
 * Runs only when a code block has no fence-hint. Returns the best-guess
 * canonical language, or "generic" if nothing scores above zero. Caller is
 * responsible for tagging the result as languageConfidence: "inferred" —
 * this function only picks the language, not the confidence tier.
 */
export function inferLanguage(rawCode: string): CanonicalLanguage {
  const scores: Array<[CanonicalLanguage, number]> = [
    ["typescript", score(rawCode, TYPESCRIPT_RULES)],
    ["python", score(rawCode, PYTHON_RULES)],
    ["javascript", score(rawCode, JAVASCRIPT_RULES)],
    ["shell", score(rawCode, SHELL_RULES)],
  ];

  const [bestLanguage, bestScore] = scores.reduce((best, current) => (current[1] > best[1] ? current : best));
  return bestScore > 0 ? bestLanguage : "generic";
}
