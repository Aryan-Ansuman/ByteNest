import type { CanonicalLanguage } from "./catalog";

// Decision from Phase 2 — raw fence-hint strings authors actually write,
// normalized to the canonical set. Lowercased before lookup, so casing in
// the fence hint ("JavaScript", "Python3") never matters.
const LANGUAGE_HINT_MAP: Record<string, CanonicalLanguage> = {
  // JavaScript
  js: "javascript",
  javascript: "javascript",
  node: "javascript",
  nodejs: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",

  // TypeScript
  ts: "typescript",
  typescript: "typescript",
  tsx: "typescript",

  // Python
  py: "python",
  python: "python",
  python3: "python",
  py3: "python",

  // Shell
  bash: "shell",
  sh: "shell",
  shell: "shell",
  zsh: "shell",
  shellscript: "shell",
  console: "shell",
};

/**
 * Maps a raw fence-hint string (already known to be non-empty) to a
 * canonical language. Unrecognized strings fall back to "generic" — they
 * still get language-agnostic rules, just no language-specific ones.
 */
export function normalizeLanguageHint(rawHint: string): CanonicalLanguage {
  const key = rawHint.trim().toLowerCase();
  return LANGUAGE_HINT_MAP[key] ?? "generic";
}
