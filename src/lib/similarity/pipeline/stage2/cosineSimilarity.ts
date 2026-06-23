/**
 * Step 6.8 — Cosine similarity computation.
 * Operates on pre-normalized vectors for efficiency.
 * With 150 candidates × 1536 dims: ~230k multiply-adds — sub-millisecond on any server.
 */

export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function magnitude(v: number[]): number {
  return Math.sqrt(dotProduct(v, v));
}

export function normalizeVector(v: number[]): number[] {
  const mag = magnitude(v);
  if (mag === 0) return v;
  return v.map((x) => x / mag);
}

/**
 * Cosine similarity between two raw (un-normalized) vectors.
 * Returns value in [-1, 1]. For semantic similarity, expect [0, 1].
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

/**
 * Batch cosine similarity: source vector against many candidates.
 * Pre-normalizes source once, then dot-products against each candidate.
 * More efficient than calling cosineSimilarity() in a loop.
 */
export function batchCosineSimilarity(
  source: number[],
  candidates: number[][]
): number[] {
  const normSource = normalizeVector(source);
  return candidates.map((candidate) => {
    const normCandidate = normalizeVector(candidate);
    return dotProduct(normSource, normCandidate);
  });
}
