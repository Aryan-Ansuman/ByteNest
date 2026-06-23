/**
 * Estimates the expertise level an answer targets
 * by analyzing vocabulary in the accepted answer body.
 *
 * Returns a complexity score 0–1:
 *   0.0 = beginner-oriented (short sentences, basic vocabulary)
 *   1.0 = expert-oriented   (long sentences, technical vocabulary)
 */

const BEGINNER_MARKERS = [
  'first', 'simple', 'basic', 'easy', 'beginner', 'just', 'simply',
  'start', 'introduction', 'getting started', 'tutorial', 'example',
];

const EXPERT_MARKERS = [
  'optimize', 'performance', 'complexity', 'algorithm', 'architecture',
  'tradeoff', 'trade-off', 'memory', 'concurrent', 'asynchronous',
  'idempotent', 'invariant', 'heuristic', 'amortized', 'transpile',
  'memoize', 'closure', 'prototype', 'polymorphism', 'abstraction',
  'dependency injection', 'race condition', 'deadlock', 'throughput',
];

export function computeAnswerComplexity(answerBody: string | null | undefined): number {
  if (!answerBody || answerBody.length < 10) return 0.5; // neutral if no answer

  const text       = answerBody.toLowerCase();
  const words      = text.split(/\s+/);
  const sentences  = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  // Signal 1: average sentence length (longer = more expert)
  const avgSentenceLength = words.length / Math.max(sentences.length, 1);
  const sentenceScore     = Math.min(avgSentenceLength / 30, 1.0); // normalize at 30 words/sentence

  // Signal 2: beginner marker density
  const beginnerCount = BEGINNER_MARKERS.filter(m => text.includes(m)).length;
  const beginnerScore = Math.min(beginnerCount / 5, 1.0);

  // Signal 3: expert marker density
  const expertCount = EXPERT_MARKERS.filter(m => text.includes(m)).length;
  const expertScore = Math.min(expertCount / 5, 1.0);

  // Signal 4: code block ratio (more code = more expert)
  const codeBlocks     = (answerBody.match(/```[\s\S]*?```/g) ?? []).length;
  const codeBlockScore = Math.min(codeBlocks / 3, 1.0);

  // Weighted composite
  const complexity =
    sentenceScore  * 0.25 +
    expertScore    * 0.35 +
    codeBlockScore * 0.25 +
    (1 - beginnerScore) * 0.15;

  return Math.max(0, Math.min(1, complexity));
}

/**
 * Classify complexity score into a tier label for logging and explainability.
 */
export function classifyComplexity(score: number): string {
  if (score < 0.25) return 'beginner';
  if (score < 0.50) return 'learner';
  if (score < 0.70) return 'intermediate';
  if (score < 0.85) return 'advanced';
  return 'expert';
}
