import { toLines, getBlockBody, lineNumbers } from "../rule-utils";
import type { RuleFunction, RuleDetection } from "./agnostic-rules";

// 10 — memory-leak-risk
const SUBSCRIBE_PATTERNS: Array<[RegExp, RegExp]> = [
  [/\.addEventListener\(\s*['"](\w+)['"]/, /\.removeEventListener\(/],
  [/\bsetInterval\(/, /\bclearInterval\(/],
  [/\.subscribe\(/, /\.unsubscribe\(/],
];

export const memoryLeakRisk: RuleFunction = (rawCode) => {
  const detections: RuleDetection[] = [];
  const lines = toLines(rawCode);

  for (const [setupPattern, teardownPattern] of SUBSCRIBE_PATTERNS) {
    const setupHits = lines.filter((l) => setupPattern.test(l.text));
    if (setupHits.length === 0) continue;
    const hasTeardown = lines.some((l) => teardownPattern.test(l.text));
    if (!hasTeardown) {
      detections.push({
        triggeredBy: setupHits[0].text.trim(),
        lineNumbers: lineNumbers(setupHits[0]),
        confidenceOverride: "medium", // the snippet may be excerpted and cleanup could live elsewhere
      });
    }
  }

  return detections.length > 0 ? detections : null;
};

// 11 — promise-not-awaited
const PROMISE_RETURNING_CALL = /^\s*(fetch\(|axios\.\w+\(|\w+\.(query|save|create|findOne|then)\()/;

export const promiseNotAwaited: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const detections: RuleDetection[] = [];

  lines.forEach((line) => {
    const trimmed = line.text.trim();
    if (!PROMISE_RETURNING_CALL.test(trimmed)) return;
    if (trimmed.startsWith("await ")) return;
    if (trimmed.includes(".then(") || trimmed.includes(".catch(")) return;
    if (trimmed.startsWith("return ")) return; // returning the promise to the caller is a legitimate pattern

    detections.push({ triggeredBy: trimmed, lineNumbers: lineNumbers(line) });
  });

  return detections.length > 0 ? detections : null;
};

// 12 — implicit-any
const EXPLICIT_ANY = /:\s*any\b/;
const UNTYPED_FUNCTION_PARAMS = /^\s*(export\s+)?function\s+\w+\s*\(([^):]*)\)/;

export const implicitAny: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const detections: RuleDetection[] = [];

  lines.forEach((line) => {
    if (EXPLICIT_ANY.test(line.text)) {
      detections.push({ triggeredBy: line.text.trim(), lineNumbers: lineNumbers(line) });
      return;
    }
    const match = line.text.match(UNTYPED_FUNCTION_PARAMS);
    if (match && match[2].trim().length > 0 && !match[2].includes(":")) {
      detections.push({
        triggeredBy: line.text.trim(),
        lineNumbers: lineNumbers(line),
        confidenceOverride: "low",
      });
    }
  });

  return detections.length > 0 ? detections : null;
};

// 13 — synchronous-loop-in-async
const ASYNC_FUNCTION_HEADER = /^\s*(async\s+function\s+\w+\s*\(|const\s+\w+\s*=\s*async\s*\()/;
const LOOP_IN_ASYNC = /^\s*(for\s*\(|while\s*\()/;

export const synchronousLoopInAsync: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const detections: RuleDetection[] = [];

  lines.forEach((line, i) => {
    if (!ASYNC_FUNCTION_HEADER.test(line.text)) return;
    const fnBody = getBlockBody(lines, i);

    fnBody.forEach((bodyLine, localIdx) => {
      if (!LOOP_IN_ASYNC.test(bodyLine.text)) return;
      const loopGlobalIndex = lines.findIndex((l) => l.index === bodyLine.index);
      const loopBody = getBlockBody(lines, loopGlobalIndex);
      const hasAwaitInLoop = loopBody.some((l) => /\bawait\b/.test(l.text));
      const usesParallelization = loopBody.some((l) => /Promise\.all\(/.test(l.text)) || fnBody.some((l) => /Promise\.all\(/.test(l.text));

      if (hasAwaitInLoop && !usesParallelization) {
        detections.push({
          triggeredBy: bodyLine.text.trim(),
          lineNumbers: lineNumbers(line, bodyLine),
          confidenceOverride: "medium", // sequential awaits are sometimes intentional (rate limiting, ordering)
        });
      }
    });
  });

  return detections.length > 0 ? detections : null;
};
