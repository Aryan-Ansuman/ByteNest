import { buildEmbeddingInput } from "../nlp/buildEmbeddingInput";

/**
 * Deterministic hash of the embedding input.
 * Same algorithm as server-side contentHash stored in question_embeddings.
 * Uses SHA-256 via SubtleCrypto (available in all modern browsers).
 */
export async function computeContentHash(title: string, body: string, tags: string[] = []): Promise<string> {
  const result = await buildEmbeddingInput({ title, body, tags });
  return result.contentHash;
}

/**
 * Estimate how different two hashes are by comparing character positions.
 * Returns a value 0–1 (0 = identical, 1 = completely different).
 *
 * Why not compare raw strings? Full SHA-256 strings always differ at every
 * character when content changes — we need a proxy for content change magnitude.
 * We use the ratio of differing characters as that proxy.
 */
export function hashDelta(hashA: string | null, hashB: string | null): number {
  if (!hashA || !hashB) return 1;
  let diff = 0;
  for (let i = 0; i < hashA.length; i++) {
    if (hashA[i] !== hashB[i]) diff++;
  }
  return diff / hashA.length;
}
