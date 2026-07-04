import { SMELL_RULE_REGISTRY } from "./registry";
import { buildSnippet } from "./rule-utils";
import type { ExtractedCodeBlock, SmellEvidence } from "./types";
import type { ConfidenceLevel } from "./catalog";

const CONFIDENCE_DOWNGRADE: Record<ConfidenceLevel, ConfidenceLevel> = {
  high: "medium",
  medium: "low",
  low: "low", // floor — nothing below "low"
};

/**
 * Runs every applicable rule (by language) against a single extracted code
 * block. Returns one SmellEvidence per detection, with lineNumbers already
 * converted from block-local (1-indexed within rawCode) to absolute content
 * line numbers using block.lineStart.
 */
export function runRulesOnBlock(block: ExtractedCodeBlock): SmellEvidence[] {
  const applicableRules = SMELL_RULE_REGISTRY.filter(
    (entry) => entry.applicableTo[0] === "all" || (entry.applicableTo as string[]).includes(block.language)
  );

  const evidence: SmellEvidence[] = [];

  for (const entry of applicableRules) {
    const result = entry.rule(block.rawCode);
    if (!result) continue;

    const detections = Array.isArray(result) ? result : [result];
    for (const detection of detections) {
      let confidence = detection.confidenceOverride ?? entry.defaultConfidenceIfTriggered;
      // Decision 1 / Phase 2 — a smell found in inferred-language code is
      // downgraded one confidence level versus explicitly-declared code.
      if (block.languageConfidence === "inferred") {
        confidence = CONFIDENCE_DOWNGRADE[confidence];
      }

      evidence.push({
        smell: entry.id,
        confidence,
        triggeredBy: detection.triggeredBy,
        lineNumbers: detection.lineNumbers.map((n) => n + block.lineStart - 1),
        snippet: buildSnippet(block.rawCode, detection.lineNumbers),
        source: "pattern",
      });
    }
  }

  return evidence;
}

/**
 * Runs the engine across every code block in a question and merges results:
 * the same smell detected in multiple blocks is deduplicated, keeping the
 * highest confidence and the evidence that produced it. This is the exact
 * merge behavior Phase 4's worker needs before splitting into
 * high-confidence (→ systemTags) vs. needs-LLM (→ Phase 5) buckets.
 */
export function runRulesOnQuestion(blocks: ExtractedCodeBlock[]): SmellEvidence[] {
  const bySmell = new Map<string, SmellEvidence>();
  const confidenceRank: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

  for (const block of blocks) {
    for (const evidence of runRulesOnBlock(block)) {
      const existing = bySmell.get(evidence.smell);
      if (!existing || confidenceRank[evidence.confidence] > confidenceRank[existing.confidence]) {
        bySmell.set(evidence.smell, evidence);
      }
    }
  }

  return Array.from(bySmell.values());
}
