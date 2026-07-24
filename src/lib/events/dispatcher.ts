import type { QueuedEvent, EventType, EventPayloadMap } from "./types";
import { markProcessing, markComplete, markFailed } from "./eventQueue";
import { processQuestionDraftUpdated } from "./processors/QuestionDraftUpdatedProcessor";
import { processEmbeddingRequested } from "./processors/EmbeddingRequestedProcessor";
import { processQuestionCreated } from "./processors/QuestionCreatedProcessor";
import { processDuplicateConfirmed } from "./processors/DuplicateConfirmedProcessor";
import { processDuplicateRejected } from "./processors/DuplicateRejectedProcessor";
import { processRecomputeFreshness } from "./processors/RecomputeFreshnessProcessor";
import { processVerifyAnswer } from "./processors/VerifyAnswerProcessor";
import { processAnalyzeCodeSmells } from "./processors/AnalyzeCodeSmellsProcessor";
import { processLlmSmellValidation } from "./processors/LlmSmellValidationProcessor";
import { processFetchPrDiff } from "./processors/FetchPrDiffProcessor";
import { processRefreshPrDiff } from "./processors/RefreshPrDiffProcessor";
import { processCheckAdrConsensus } from "./processors/CheckAdrConsensusProcessor";
import { db, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";

// Must match eventQueue.ts's own markFailed() threshold — that function
// decides "pending" (retry) vs "failed" (terminal) at retryCount >= 5.
// Duplicated here, not imported, because eventQueue.ts doesn't export it as
// a named constant; if that threshold ever changes, this needs to change too.
const MAX_RETRIES = 5;

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
    const nextRetryCount = event.retryCount + 1;

    // Code Smell Auto-Tagger's exhausted-retry side effect: the generic
    // event_queue infra only tracks the EVENT's terminal state, not any
    // application-level consequence of giving up. AnalyzeCodeSmells is the
    // one event type here where "we gave up" needs to be visible on the
    // question document itself (smellAnalysisStatus: "failed"), not just
    // buried in a terminally-failed queue row nobody's looking at.
    if (event.eventType === "AnalyzeCodeSmells" && nextRetryCount >= MAX_RETRIES) {
      await markQuestionSmellAnalysisFailed(event.payload);
    }

    await markFailed(event.$id, nextRetryCount);
  }
}

async function markQuestionSmellAnalysisFailed(rawPayload: string): Promise<void> {
  try {
    const { questionId } = JSON.parse(rawPayload) as { questionId?: string };
    if (!questionId) return;
    await databases.updateDocument(db, questionCollection, questionId, {
      smellAnalysisStatus: "failed",
      smellAnalysisAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[dispatcher] Failed to mark question smellAnalysisStatus as failed:", err);
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

    case "RecomputeFreshness":
      return processRecomputeFreshness(
        payload as EventPayloadMap["RecomputeFreshness"]
      );

    case "VerifyAnswer":
      return processVerifyAnswer(
        payload as EventPayloadMap["VerifyAnswer"]
      );

    case "AnalyzeCodeSmells":
      return processAnalyzeCodeSmells(
        payload as EventPayloadMap["AnalyzeCodeSmells"]
      );

    case "LlmSmellValidation":
      return processLlmSmellValidation(
        payload as EventPayloadMap["LlmSmellValidation"]
      );

    case "FetchPrDiff":
      return processFetchPrDiff(
        payload as EventPayloadMap["FetchPrDiff"]
      );

    case "RefreshPrDiff":
      return processRefreshPrDiff(
        payload as EventPayloadMap["RefreshPrDiff"]
      );

    case "CheckAdrConsensus":
      return processCheckAdrConsensus(
        payload as EventPayloadMap["CheckAdrConsensus"]
      );

    default: {
      const _exhaustive: never = eventType;
      throw new Error(`Unhandled event type: ${_exhaustive}`);
    }
  }
}
