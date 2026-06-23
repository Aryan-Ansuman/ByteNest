import type { QuestionDraftUpdatedPayload } from "../types";
// Stubbed import for Phase 6
// import { routeSimilarityRequest } from "@/lib/similarity/router";

const MIN_TITLE_LENGTH = 20;
const MIN_COMBINED_LENGTH = 50;

/**
 * Step 5.1 — QuestionDraftUpdated processor.
 * Runs candidate generation if content meets minimum thresholds.
 * Short-circuits silently if content is too thin — no error, no suggestion.
 */
export async function processQuestionDraftUpdated(
  payload: QuestionDraftUpdatedPayload
): Promise<void> {
  const { draftTitle, draftBody, draftTags, sessionId, userId } = payload;

  const combined = draftTitle + draftBody;
  if (
    draftTitle.length < MIN_TITLE_LENGTH ||
    combined.length < MIN_COMBINED_LENGTH
  ) {
    return; // below threshold — no suggestions yet
  }

  // Delegates to the realtime pipeline (Phase 6 fills this in)
  // await routeSimilarityRequest({
  //   consumerId: "duplicate_detection",
  //   draftTitle,
  //   draftBody,
  //   draftTags,
  // });
}
