import { toLines, getBlockBody, lineNumbers } from "../rule-utils";
import type { RuleFunction, RuleDetection } from "./agnostic-rules";

// 14 — bare-except
const BARE_EXCEPT = /^\s*except\s*:\s*$/;

export const bareExcept: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const hits = lines.filter((l) => BARE_EXCEPT.test(l.text));
  if (hits.length === 0) return null;
  return hits.map((hit) => ({ triggeredBy: hit.text.trim(), lineNumbers: lineNumbers(hit) }));
};

// 15 — mutable-default-argument
const MUTABLE_DEFAULT_ARG = /def\s+\w+\s*\([^)]*=\s*(\[\]|\{\})/;

export const mutableDefaultArgument: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const hit = lines.find((l) => MUTABLE_DEFAULT_ARG.test(l.text));
  if (!hit) return null;
  return { triggeredBy: hit.text.trim(), lineNumbers: lineNumbers(hit) };
};

// 16 — global-state-mutation
const GLOBAL_KEYWORD = /^\s*global\s+\w+/;

export const globalStateMutation: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const hits = lines.filter((l) => GLOBAL_KEYWORD.test(l.text));
  if (hits.length === 0) return null;
  return hits.map((hit) => ({ triggeredBy: hit.text.trim(), lineNumbers: lineNumbers(hit) }));
};

// 17 — string-concatenation-in-loop
const LOOP_HEADER_PY = /^\s*(for\s+\w+.*:|while\s+.*:)/;
const STRING_CONCAT_ASSIGN = /^\s*\w+\s*\+=\s*(['"]|f['"])/;

export const stringConcatenationInLoop: RuleFunction = (rawCode) => {
  const lines = toLines(rawCode);
  const detections: RuleDetection[] = [];

  lines.forEach((line, i) => {
    if (!LOOP_HEADER_PY.test(line.text)) return;
    const body = getBlockBody(lines, i);
    const hit = body.find((l) => STRING_CONCAT_ASSIGN.test(l.text));
    if (hit) {
      detections.push({ triggeredBy: hit.text.trim(), lineNumbers: lineNumbers(line, hit) });
    }
  });

  return detections.length > 0 ? detections : null;
};
