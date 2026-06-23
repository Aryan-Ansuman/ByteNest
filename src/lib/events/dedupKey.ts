import type { EventType, EventPayloadMap } from "./types";

/**
 * Derives a deterministic dedup key from the event type and the fields that
 * make this event unique. Same event fired twice in quick succession produces
 * the same key — the processor skips the duplicate.
 *
 * Primary fields per event type are chosen to be the minimal set that
 * uniquely identifies "this exact thing happened" without being so broad
 * that genuinely separate events collide.
 */
export async function buildDedupKey<T extends EventType>(
  eventType: T,
  payload: EventPayloadMap[T]
): Promise<string> {
  const primaryFields = extractPrimaryFields(eventType, payload);
  const raw = `${eventType}:${JSON.stringify(primaryFields)}`;
  return sha256(raw);
}

function extractPrimaryFields<T extends EventType>(
  eventType: T,
  payload: EventPayloadMap[T]
): Record<string, unknown> {
  // Only the fields that make this event unique are included.
  // Volatile fields (timestamps, error messages) are excluded.
  const p = payload as Record<string, unknown>;

  const fieldMap: Record<EventType, string[]> = {
    QuestionDraftUpdated:  ["sessionId"],
    EmbeddingRequested:    ["questionId", "contentHash"],
    EmbeddingGenerated:    ["questionId", "contentHash"],
    EmbeddingFailed:       ["questionId", "retryCount"],
    QuestionCreated:       ["questionId"],
    DuplicateSuggested:    ["sessionId"],
    DuplicateConfirmed:    ["sessionId", "candidateId"],
    DuplicateRejected:     ["sessionId", "candidateId"],
  };

  const fields = fieldMap[eventType];
  return Object.fromEntries(fields.map((f) => [f, p[f]]));
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
