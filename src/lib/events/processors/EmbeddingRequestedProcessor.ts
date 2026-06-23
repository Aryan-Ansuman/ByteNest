import type { EmbeddingRequestedPayload } from "../types";
import { generateEmbedding } from "@/lib/similarity/nlp/embeddingClient";
import {
  writeCompletedEmbedding,
  setStatus,
} from "@/lib/similarity/data/embeddingRepository";
import { publishEvent } from "../eventQueue";

const CURRENT_EMBEDDING_VERSION = parseInt(
  process.env.EMBEDDING_MODEL_VERSION ?? "1",
  10
);

/**
 * Step 5.1 — EmbeddingRequested processor.
 * Calls the embedding API, writes the result, emits EmbeddingGenerated or EmbeddingFailed.
 */
export async function processEmbeddingRequested(
  payload: EmbeddingRequestedPayload
): Promise<void> {
  const { questionId, embeddingInput, contentHash } = payload;

  await setStatus(questionId, "generating");

  try {
    const result = await generateEmbedding(embeddingInput);

    await writeCompletedEmbedding(
      questionId,
      result.vector,
      embeddingInput,
      result.model,
      CURRENT_EMBEDDING_VERSION,
      contentHash
    );

    await publishEvent("EmbeddingGenerated", {
      questionId,
      embeddingModel: result.model,
      embeddingVersion: CURRENT_EMBEDDING_VERSION,
      dimensions: result.dimensions,
      contentHash,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Read current retry count from the embedding record — re-emit as EmbeddingFailed
    // Retry count tracking is on the QueuedEvent; here we pass 0 as a placeholder
    // — the queue's markFailed increments retryCount on the queue document
    await publishEvent("EmbeddingFailed", {
      questionId,
      retryCount: 0, // overridden by queue retry mechanism
      errorMessage,
      nextRetryAt: new Date(Date.now() + 30_000).toISOString(),
    });
  }
}
