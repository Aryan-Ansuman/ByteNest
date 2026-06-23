import type { QueuedEvent, EventType, EventPayloadMap } from "./types";
import { markProcessing, markComplete, markFailed } from "./eventQueue";
import { processQuestionDraftUpdated } from "./processors/QuestionDraftUpdatedProcessor";
import { processEmbeddingRequested } from "./processors/EmbeddingRequestedProcessor";
import { processQuestionCreated } from "./processors/QuestionCreatedProcessor";
import { processDuplicateConfirmed } from "./processors/DuplicateConfirmedProcessor";
import { processDuplicateRejected } from "./processors/DuplicateRejectedProcessor";

/**
 * Dispatches a queued event to its processor.
 * Handles status transitions and retry counting.
 * Called by Appwrite Function pollers.
 */
export async function dispatchEvent(event: QueuedEvent): Promise<void> {
  if (!event.$id) throw new Error("Event missing $id");

  await markProcessing(event.$id);

  try {
    const payload = JSON.parse(event.payload);
    await route(event.eventType, payload);
    await markComplete(event.$id);
  } catch (err) {
    console.error(`[dispatcher] failed to process ${event.eventType}:`, err);
    await markFailed(event.$id, event.retryCount + 1);
  }
}

async function route(eventType: EventType, payload: unknown): Promise<void> {
  switch (eventType) {
    case "QuestionDraftUpdated":
      return processQuestionDraftUpdated(
        payload as EventPayloadMap["QuestionDraftUpdated"]
      );

    case "EmbeddingRequested":
      return processEmbeddingRequested(
        payload as EventPayloadMap["EmbeddingRequested"]
      );

    case "EmbeddingGenerated":
      // Phase 6 wires the ranking pipeline here
      return;

    case "EmbeddingFailed":
      // Retry is handled by markFailed — no additional processing needed
      return;

    case "QuestionCreated":
      return processQuestionCreated(
        payload as EventPayloadMap["QuestionCreated"]
      );

    case "DuplicateSuggested":
      // Phase 8 wires feedback session creation here
      return;

    case "DuplicateConfirmed":
      return processDuplicateConfirmed(
        payload as EventPayloadMap["DuplicateConfirmed"]
      );

    case "DuplicateRejected":
      return processDuplicateRejected(
        payload as EventPayloadMap["DuplicateRejected"]
      );

    default: {
      const _exhaustive: never = eventType;
      throw new Error(`Unhandled event type: ${_exhaustive}`);
    }
  }
}
