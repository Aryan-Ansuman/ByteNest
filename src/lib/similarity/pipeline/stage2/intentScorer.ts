import {
  classifyIntent,
  computeIntentSimilarity,
} from "@/lib/similarity/nlp/intentClassifier";
import type { IntentClassification } from "@/lib/similarity/nlp/intentClassifier";

export type CandidateIntentContext = {
  questionId: string;
  intentLabel: string;
  intentConfidence: number;
};

/**
 * Step 6.9 — Intent similarity computation.
 * Classifies source intent once, compares against stored candidate intents.
 * Returns null when either side is uncertain — caller excludes from formula.
 */
export function scoreIntents(
  sourceClassification: IntentClassification,
  candidateContext: CandidateIntentContext
): number | null {
  const candidateClassification: IntentClassification = {
    label: candidateContext.intentLabel as IntentClassification["label"],
    confidence: candidateContext.intentConfidence,
    matchedSignals: [],
    isUncertain: candidateContext.intentConfidence < 0.4,
  };

  return computeIntentSimilarity(sourceClassification, candidateClassification);
}

export function classifySourceIntent(title: string): IntentClassification {
  return classifyIntent(title);
}
