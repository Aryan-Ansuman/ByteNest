import { normalizeLanguageHint } from "./language-map";
import { inferLanguage } from "./infer-language";
import type { ExtractedCodeBlock } from "./types";

// Matches fenced code blocks: 3+ backticks at the start of a line,
// optional language hint immediately after (no whitespace before it, per
// the fence spec), then content up to a closing fence of the SAME backtick
// count at the start of its own line.
//
// Known limitation (flagged, not fixed here): CommonMark technically allows
// a closing fence with MORE backticks than the opening one; this regex
// requires an exact match via backreference. Content authored with a
// mismatched-longer closing fence — rare in practice, and not a pattern
// ByteNest's own MDEditor/SafeMarkdown pipeline produces — won't be
// detected as closed by that longer fence and will instead extend to the
// next matching same-length fence or the end of the string.
//
// Known scope limit: fences indented inside a blockquote ("> ```") are
// NOT detected — the regex requires the fence at true column 0. Blockquoted
// code is uncommon in this app's Q&A authoring flow; if it turns out to
// matter, this is the place to loosen the anchor.
const FENCE_PATTERN = /^(`{3,})([^\n`]*)\n([\s\S]*?)\n\1[ \t]*$/gm;

export function extractCodeBlocks(content: string): ExtractedCodeBlock[] {
  if (!content || !content.includes("```")) return [];

  const blocks: ExtractedCodeBlock[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex explicitly — this regex object is module-scoped-safe
  // since /g regexes are stateful across calls if reused without exec loop
  // discipline. Using .exec in a while loop already advances lastIndex
  // correctly per call, but resetting defensively costs nothing.
  FENCE_PATTERN.lastIndex = 0;

  while ((match = FENCE_PATTERN.exec(content)) !== null) {
    const [fullMatch, , hintRaw, rawCode] = match;
    const hint = hintRaw.trim();

    const languageConfidence: ExtractedCodeBlock["languageConfidence"] = hint ? "explicit" : "inferred";
    const language = hint ? normalizeLanguageHint(hint) : inferLanguage(rawCode);

    const fenceLineNumber = countLinesBefore(content, match.index) + 1; // 1-indexed line the opening fence sits on
    const lineStart = fenceLineNumber + 1; // first line of actual code content
    const codeLineCount = rawCode.length === 0 ? 0 : rawCode.split("\n").length;
    const lineEnd = codeLineCount === 0 ? lineStart : lineStart + codeLineCount - 1;

    // Skip genuinely empty fences (```` ``` ``` ````) — nothing to analyze.
    if (rawCode.trim().length > 0) {
      blocks.push({
        language,
        rawCode,
        lineStart,
        lineEnd,
        languageConfidence,
      });
    }

    // Guard against zero-width matches causing an infinite loop — shouldn't
    // happen given the pattern requires at least the fence markers + a
    // newline, but cheap insurance in a while-exec loop.
    if (match.index === FENCE_PATTERN.lastIndex) {
      FENCE_PATTERN.lastIndex += 1;
    }
  }

  return blocks;
}

function countLinesBefore(content: string, index: number): number {
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) count++;
  }
  return count;
}
