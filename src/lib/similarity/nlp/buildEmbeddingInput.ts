/**
 * Step 2.2 — Structured embedding input construction.
 * Does NOT embed full question content. Combines title + stripped body (150 tokens) + tags.
 * Code blocks stripped because they are semantically opaque to embedding models.
 * Stored alongside the vector for exact reproduction during re-embedding.
 */

const CODE_BLOCK_REGEX = /```[\s\S]*?```|`[^`]+`/g;

/**
 * Rough token estimator: ~4 chars per token (GPT tokenizer approximation).
 * Good enough for trimming to 150 tokens without a real tokenizer dependency.
 */
function trimToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trimEnd();
}

export type EmbeddingInputParams = {
  title: string;
  body: string;
  tags: string[];
};

export type EmbeddingInputResult = {
  embeddingInput: string;
  contentHash: string;
};

export async function buildEmbeddingInput(
  params: EmbeddingInputParams
): Promise<EmbeddingInputResult> {
  const { title, body, tags } = params;

  const strippedBody = body.replace(CODE_BLOCK_REGEX, "").replace(/\s+/g, " ").trim();
  const trimmedBody = trimToTokens(strippedBody, 150);
  const tagString = tags.join(", ");

  const embeddingInput = [title.trim(), trimmedBody, tagString]
    .filter(Boolean)
    .join("\n");

  const contentHash = await sha256(embeddingInput);

  return { embeddingInput, contentHash };
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
