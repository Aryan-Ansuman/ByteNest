// Shared helpers for structural rules (deep nesting, n+1-query, god-function,
// loop-body scanning). Deliberately indentation/brace-based, not a real AST
// parser — Decision 2 ruled out anything that requires the snippet to parse
// cleanly, since Q&A code is routinely incomplete.

export type LineInfo = { text: string; indent: number; index: number }; // index is 0-based within rawCode

export function toLines(rawCode: string): LineInfo[] {
  return rawCode.split("\n").map((text, index) => ({ text, indent: indentWidth(text), index }));
}

// Tabs counted as 4 columns — just needs to be internally consistent for
// relative-depth comparisons, not visually exact.
function indentWidth(line: string): number {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4;
    else break;
  }
  return width;
}

/**
 * Given a header line (a loop, a function def, an if/try, etc.), returns
 * the lines that make up its body — using indentation for Python-like code
 * and brace-depth for brace languages, whichever the line actually uses.
 * Falls back to "next lines strictly more indented than the header, until
 * indentation returns to <= header indent" when neither braces nor a colon
 * give a clean signal — handles most real snippets even when broken/partial.
 */
export function getBlockBody(lines: LineInfo[], headerIndex: number): LineInfo[] {
  const header = lines[headerIndex];
  if (header.text.includes("{")) {
    return getBraceBody(lines, headerIndex);
  }
  return getIndentBody(lines, headerIndex);
}

function getBraceBody(lines: LineInfo[], headerIndex: number): LineInfo[] {
  let depth = 0;
  let started = false;
  const body: LineInfo[] = [];

  for (let i = headerIndex; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line.text) {
      if (ch === "{") { depth += 1; started = true; }
      else if (ch === "}") { depth -= 1; }
    }
    if (i > headerIndex) body.push(line);
    if (started && depth <= 0) break;
  }
  return body;
}

function getIndentBody(lines: LineInfo[], headerIndex: number): LineInfo[] {
  const headerIndent = lines[headerIndex].indent;
  const body: LineInfo[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.text.trim().length === 0) { body.push(line); continue; } // blank lines don't end the block
    if (line.indent <= headerIndent) break;
    body.push(line);
  }
  return body;
}

/**
 * Walks backward from a given line to find the nearest enclosing header
 * whose body the line participates in — used by missing-error-handling to
 * check "is this risky call inside a try/except at any enclosing level."
 */
export function findEnclosingHeader(lines: LineInfo[], fromIndex: number, headerPattern: RegExp): boolean {
  const targetIndent = lines[fromIndex].indent;
  for (let i = fromIndex - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.text.trim().length === 0) continue;
    if (line.indent < targetIndent && headerPattern.test(line.text)) return true;
    // A dedent to a non-matching, non-blank line at or below the target's
    // starting scope means we've left the relevant scope entirely.
    if (line.indent < targetIndent && !headerPattern.test(line.text)) {
      // Keep walking — this could be an `else`/elif/finally sibling or an
      // unrelated statement one level up; only stop once we reach column 0
      // without ever finding the header, which the loop's natural end
      // (i reaching -1) already handles.
      continue;
    }
  }
  return false;
}

/** 1-indexed line numbers (local to rawCode) for a set of LineInfo entries. */
export function lineNumbers(...infos: LineInfo[]): number[] {
  return infos.map((l) => l.index + 1);
}

/**
 * Builds a 3-5 line evidence snippet centered on the given local line
 * numbers (1-indexed), with light surrounding context.
 */
export function buildSnippet(rawCode: string, localLineNumbers: number[], contextLines = 1): string {
  const allLines = rawCode.split("\n");
  const min = Math.max(1, Math.min(...localLineNumbers) - contextLines);
  const max = Math.min(allLines.length, Math.max(...localLineNumbers) + contextLines);
  return allLines.slice(min - 1, max).join("\n");
}
