/**
 * Step 6.10 — Tag overlap scoring via Jaccard similarity.
 * Jaccard = |intersection| / |union|
 * Bounded [0, 1]. No external deps — pure set math.
 */
export function jaccardSimilarity(tagsA: string[], tagsB: string[]): number {
  if (tagsA.length === 0 && tagsB.length === 0) return 1.0;
  if (tagsA.length === 0 || tagsB.length === 0) return 0.0;

  const setA = new Set(tagsA.map((t) => t.toLowerCase()));
  const setB = new Set(tagsB.map((t) => t.toLowerCase()));

  let intersectionSize = 0;
  for (const tag of setA) {
    if (setB.has(tag)) intersectionSize++;
  }

  const unionSize = setA.size + setB.size - intersectionSize;
  return intersectionSize / unionSize;
}
