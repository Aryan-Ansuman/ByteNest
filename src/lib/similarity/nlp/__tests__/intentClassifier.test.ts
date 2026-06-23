/**
 * Smoke tests for the intent classifier.
 * Run with: npx jest src/lib/similarity/nlp/__tests__/intentClassifier.test.ts
 */
import { classifyIntent, computeIntentSimilarity } from "../intentClassifier";

const cases: [string, string, number][] = [
  ["React component not rendering after state update", "debugging", 0.4],
  ["How does React rendering work", "conceptual", 0.4],
  ["How to implement infinite scroll in Next.js", "procedural", 0.4],
  ["Redux vs Zustand for state management", "comparative", 0.4],
  ["Best approach to design a multi-tenant architecture", "architectural", 0.4],
  ["React", "uncertain", 0.0],
];

describe("classifyIntent", () => {
  for (const [title, expectedLabel, minConfidence] of cases) {
    it(`classifies "${title}" as ${expectedLabel}`, () => {
      const result = classifyIntent(title);
      expect(result.label).toBe(expectedLabel);
      if (expectedLabel !== "uncertain") {
        expect(result.confidence).toBeGreaterThanOrEqual(minConfidence);
        expect(result.isUncertain).toBe(false);
      } else {
        expect(result.isUncertain).toBe(true);
      }
    });
  }
});

describe("computeIntentSimilarity", () => {
  it("returns null when either side is uncertain", () => {
    const uncertain = classifyIntent("React");
    const debug = classifyIntent("React component not working");
    expect(computeIntentSimilarity(uncertain, debug)).toBeNull();
  });

  it("returns 0 when labels differ", () => {
    const debug = classifyIntent("React not rendering after update");
    const conceptual = classifyIntent("How does React rendering work");
    expect(computeIntentSimilarity(debug, conceptual)).toBe(0.0);
  });

  it("returns min(confidence_a, confidence_b) when labels match", () => {
    const a = classifyIntent("React component not working after update");
    const b = classifyIntent("Next.js API route fails with 500 error");
    const score = computeIntentSimilarity(a, b);
    expect(score).not.toBeNull();
    expect(score!).toBeLessThanOrEqual(Math.min(a.confidence, b.confidence) + 0.001);
  });
});
