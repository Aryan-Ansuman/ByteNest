import { toLines, getBlockBody, findEnclosingHeader, lineNumbers, buildSnippet, type LineInfo } from "../rule-utils";
import type { ConfidenceLevel } from "../catalog";

export type RuleDetection = { triggeredBy: string; lineNumbers: number[]; confidenceOverride?: ConfidenceLevel };
export type RuleFunction = (rawCode: string) => RuleDetection | RuleDetection[] | null;

const LOOP_HEADER = /^\s*(for\s*\(|for\s+\w+.*:|while\s*\(|while\s+.*:|\.forEach\(|\.map\()/;
const DB_HTTP_CALL = /(await\s+\w+\.(query|find|findOne|save|create|update)\(|\bfetch\(|\baxios\.\w+\(|\bhttp\.get\(|\bprisma\.\w+\.\w+\(|\bmongoose\.\w+\.\w+\()/;

// 1 — n+1-query
export const n1Query: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const detections: RuleDetection[] = [];

  lines.forEach((line, i) => {
    if (!LOOP_HEADER.test(line.text)) return;
    const body = getBlockBody(lines, i);
    const hit = body.find((l) => DB_HTTP_CALL.test(l.text));
    if (hit) {
      detections.push({
        triggeredBy: hit.text.trim(),
        lineNumbers: lineNumbers(line, hit),
      });
    }
  });

  return detections.length > 0 ? detections : null;
};

// 2 — missing-error-handling
const RISKY_CALL = /(await\s+fetch\(|await\s+\w+\.(query|save|create|findOne)\(|JSON\.parse\(|fs\.readFile|open\(|requests\.\w+\()/;
const TRY_HEADER = /^\s*(try\s*[:{]|try\s*$)/;

export const missingErrorHandling: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const detections: RuleDetection[] = [];

  lines.forEach((line, i) => {
    if (!RISKY_CALL.test(line.text)) return;
    const insideTry = findEnclosingHeader(lines, i, TRY_HEADER) || /\btry\s*[:{]/.test(lines.slice(0, i + 1).map(l => l.text).join(""));
    if (!insideTry) {
      detections.push({ triggeredBy: line.text.trim(), lineNumbers: lineNumbers(line) });
    }
  });

  return detections.length > 0 ? detections : null;
};

// 3 — blocking-main-thread
const BLOCKING_CALL = /(fs\.readFileSync|fs\.writeFileSync|child_process\.execSync|\bexecSync\(|time\.sleep\(|Thread\.sleep\()/;

export const blockingMainThread: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const hit = lines.find((l) => BLOCKING_CALL.test(l.text));
  if (!hit) return null;
  return { triggeredBy: hit.text.trim(), lineNumbers: lineNumbers(hit) };
};

// 4 — deep-nesting
const DEEP_NESTING_THRESHOLD = 4; // block levels

export const deepNesting: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const nonBlank = lines.filter((l) => l.text.trim().length > 0);
  if (nonBlank.length === 0) return null;

  const indentUnit = smallestPositiveIndentDelta(nonBlank);
  if (indentUnit === null) return null;

  let deepest: LineInfo | null = null;
  let deepestLevel = 0;
  for (const line of nonBlank) {
    const level = Math.round(line.indent / indentUnit);
    if (level > deepestLevel) { deepestLevel = level; deepest = line; }
  }

  if (deepestLevel >= DEEP_NESTING_THRESHOLD && deepest) {
    return { triggeredBy: deepest.text.trim(), lineNumbers: lineNumbers(deepest) };
  }
  return null;
};

function smallestPositiveIndentDelta(lines: LineInfo[]): number | null {
  const indents = Array.from(new Set(lines.map((l) => l.indent))).filter((n) => n > 0).sort((a, b) => a - b);
  return indents.length > 0 ? indents[0] : null;
}

// 5 — god-function
const FUNCTION_HEADER = /^\s*(function\s+\w+\s*\(|const\s+\w+\s*=\s*(async\s*)?\(|def\s+\w+\s*\(|async\s+function\s+\w+\s*\()/;
const GOD_FUNCTION_LINE_THRESHOLD = 40;

export const godFunction: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const detections: RuleDetection[] = [];

  lines.forEach((line, i) => {
    if (!FUNCTION_HEADER.test(line.text)) return;
    const body = getBlockBody(lines, i);
    const nonBlankBody = body.filter((l) => l.text.trim().length > 0);
    if (nonBlankBody.length > GOD_FUNCTION_LINE_THRESHOLD) {
      detections.push({
        triggeredBy: line.text.trim(),
        lineNumbers: lineNumbers(line),
        confidenceOverride: "medium", // long-function-in-a-snippet is suggestive, not certain — the snippet may just be excerpted
      });
    }
  });

  return detections.length > 0 ? detections : null;
};

// 6 — debug-code-left
const DEBUG_PATTERN = /(console\.(log|debug)\(|debugger;?|print\(.*\)\s*#\s*debug|pdb\.set_trace\(\)|System\.out\.println\()/;

export const debugCodeLeft: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const hits = lines.filter((l) => DEBUG_PATTERN.test(l.text));
  if (hits.length === 0) return null;
  return hits.map((hit) => ({ triggeredBy: hit.text.trim(), lineNumbers: lineNumbers(hit) }));
};

// 7 — magic-numbers
const COMMON_NUMBERS = new Set(["0", "1", "-1", "2", "10", "100", "1000"]);
const NUMBER_IN_EXPRESSION = /(?<![\w.])(-?\d+(?:\.\d+)?)(?![\w.])/g;
const MAGIC_NUMBER_MIN_HITS = 2; // one stray literal isn't worth flagging; a pattern of them is

export const magicNumbers: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const hits: LineInfo[] = [];

  for (const line of lines) {
    // Skip declarations that are plausibly self-documenting constants.
    if (/^\s*(const|let|var|[A-Z_]+\s*=)/.test(line.text) && /[A-Z_]{2,}\s*=/.test(line.text)) continue;

    const matches = Array.from(line.text.matchAll(NUMBER_IN_EXPRESSION)).map((m) => m[1]);
    if (matches.some((n) => !COMMON_NUMBERS.has(n))) hits.push(line);
  }

  if (hits.length < MAGIC_NUMBER_MIN_HITS) return null;
  return { triggeredBy: hits[0].text.trim(), lineNumbers: lineNumbers(...hits.slice(0, 5)) };
};

// 8 — sql-in-loop
const SQL_STRING = /(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+.+/i;

export const sqlInLoop: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const detections: RuleDetection[] = [];

  lines.forEach((line, i) => {
    if (!LOOP_HEADER.test(line.text)) return;
    const body = getBlockBody(lines, i);
    const hit = body.find((l) => SQL_STRING.test(l.text));
    if (hit) {
      detections.push({ triggeredBy: hit.text.trim(), lineNumbers: lineNumbers(line, hit) });
    }
  });

  return detections.length > 0 ? detections : null;
};

// 9 — select-star
const SELECT_STAR = /SELECT\s+\*\s+FROM/i;

export const selectStar: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const hit = lines.find((l) => SELECT_STAR.test(l.text));
  if (!hit) return null;
  return { triggeredBy: hit.text.trim(), lineNumbers: lineNumbers(hit) };
};
