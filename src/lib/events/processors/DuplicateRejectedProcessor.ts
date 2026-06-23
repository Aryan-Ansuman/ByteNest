import type { DuplicateRejectedPayload } from "../types";
import { rejectCandidate } from "@/lib/similarity/data/candidateRepository";
import { recordFeedback } from "@/lib/similarity/data/feedbackRepository";
// Stubbed import for Phase 6
// import { makeNodeKey } from "@/lib/graph/nodeKey";
// import { rejectSimilarityEdge } from "@/lib/graph/edgeRepository";

/**
 * Step 5.1 — DuplicateRejected processor.
 * Records negative signal and propagates rejection to graph edge if one exists.
 */
export async function processDuplicateRejected(
  payload: DuplicateRejectedPayload
): Promise<void> {
  const {
    sessionId,
    userId,
    sourceQuestionId,
    candidateId,
    rank,
    timeToActionMs,
  } = payload;

  const actorId = userId ?? "anonymous";

  if (sourceQuestionId) {
    await rejectCandidate(sourceQuestionId, candidateId, actorId);
  }

  await recordFeedback({
    sessionId,
    userId,
    sourceQuestionTitle: "",
    suggestedCandidateId: candidateId,
    rank,
    action: "reported_not_duplicate",
    timeToActionMs,
    intentLabel: "",
  });
}
