import type { QuestionCreatedPayload } from "../types";
import { buildEmbeddingInput } from "@/lib/similarity/nlp/buildEmbeddingInput";
import { classifyIntent } from "@/lib/similarity/nlp/intentClassifier";
import { createPendingEmbedding, isContentDrifted } from "@/lib/similarity/data/embeddingRepository";
import { wireQuestionIntoGraph } from "@/lib/graph/graphService";
import { publishEvent } from "../eventQueue";

/**
 * Step 5.1 — QuestionCreated processor.
 * Orchestrates: embedding check → graph wiring → embedding request if needed.
 */
export async function processQuestionCreated(
  payload: QuestionCreatedPayload
): Promise<void> {
  const {
    questionId,
    title,
    body,
    tags,
    authorId,
    embeddingAlreadyComplete,
    tagQuestionCounts,
  } = payload;

  // 1. Classify intent for graph node
  const intent = classifyIntent(title);

  // 2. Wire into knowledge graph (idempotent)
  await wireQuestionIntoGraph({
    questionId,
    tags,
    embeddingId: embeddingAlreadyComplete ? questionId : null,
    intentLabel: intent.label,
    intentConfidence: intent.confidence,
    voteCount: 0,
    answerCount: 0,
    createdAt: new Date().toISOString(),
    tagQuestionCounts,
  });

  // 3. Request embedding if not already complete from draft flow
  const { databases } = await import("@/models/server/config");
  const { questionEmbeddingsCollection, db } = await import("@/models/name");
  const { Query, ID } = await import("node-appwrite");
  const { getActiveEmbeddingModel } = await import("@/lib/similarity/config/getActiveEmbeddingModel");

  const existing = await databases.listDocuments(
    db,
    questionEmbeddingsCollection,
    [Query.equal('questionId', questionId), Query.limit(1)]
  );

  if (existing.total > 0) {
    const doc = existing.documents[0];
    if (doc.embeddingStatus === 'complete') {
      return; // Already done during duplicate detection
    }
    return; // Exists but not complete — leave it, job will finish
  }

  // No embedding yet — create pending record and queue job
  const { embeddingInput, contentHash } = await buildEmbeddingInput({
    title,
    body,
    tags,
  });

  const activeModel = await getActiveEmbeddingModel();

  await databases.createDocument(
    db,
    questionEmbeddingsCollection,
    ID.unique(),
    {
      questionId,
      embeddingInput,
      contentHash,
      embeddingModel:   activeModel.name,
      embeddingVersion: activeModel.version,
      embeddingStatus:  'pending',
      retryCount:       0,
      dimensions:       activeModel.dimensions,
      lastEmbeddedAt:   null,
      embeddingVector:  null,
      failureReason:    null,
      nextRetryAt:      null,
    }
  );

  await publishEvent("EmbeddingRequested", {
    questionId,
    priority: 'normal',
  });
}
