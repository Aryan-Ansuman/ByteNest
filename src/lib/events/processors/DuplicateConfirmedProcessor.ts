import type { DuplicateConfirmedPayload } from "../types";
import { confirmCandidate } from "@/lib/similarity/data/candidateRepository";
import { recordFeedback } from "@/lib/similarity/data/feedbackRepository";
import { makeNodeKey } from "@/lib/graph/nodeKey";
import { createEdge } from "@/lib/graph/edgeRepository";
import type { QuestionSimilarityEdgeAttrs } from "@/lib/graph/types";

/**
 * Step 5.1 — DuplicateConfirmed processor.
 * Confirms the similarity_candidates record, writes graph edge, records feedback.
 */
export async function processDuplicateConfirmed(
  payload: DuplicateConfirmedPayload
): Promise<void> {
  const {
    sessionId,
    userId,
    sourceQuestionId,
    candidateId,
    rank,
    timeToActionMs,
    confirmedBy,
    moderatorId,
  } = payload;

  const actorId = moderatorId ?? userId ?? "system";

  // 1. Update similarity_candidates status
  if (sourceQuestionId) {
    await confirmCandidate(sourceQuestionId, candidateId, actorId);

    // 2. Write question_similar_to graph edge
    const edgeAttrs: QuestionSimilarityEdgeAttrs = {
      similarityScore: 0, // populated from similarity_candidates record in Phase 6
      semanticScore: 0,
      tagOverlap: 0,
      intentMatch: null,
      detectedAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      confirmedBy: actorId,
      status: "confirmed",
    };

    await createEdge(
      makeNodeKey("question", sourceQuestionId),
      makeNodeKey("question", candidateId),
      "question_similar_to",
      1.0,
      edgeAttrs
    );
  }

  // 3. Record feedback signal
  await recordFeedback({
    sessionId,
    userId,
    sourceQuestionTitle: "", // populated by DuplicateSuggested context if needed
    suggestedCandidateId: candidateId,
    rank,
    action: "clicked",
    timeToActionMs,
    intentLabel: "",
  });
}
