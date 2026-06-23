import {
  questionEmbeddingsCollection,
  similarityCandidatesCollection,
  duplicateFeedbackCollection,
  evaluationSnapshotsCollection,
} from "@/models/name";

/**
 * Appwrite collection IDs for the similarity data layer.
 * Separate from the graph collections in lib/graph/collections.ts.
 *
 * Required Appwrite indexes — create in console or migration:
 *
 * question_embeddings:
 *   - questionId  (unique)
 *   - embeddingStatus  (key)               ← batch jobs filter by status
 *   - embeddingModel   (key)               ← model upgrade stale sweep
 *   - contentHash      (key)               ← drift detection on edit
 *
 * similarity_candidates:
 *   - questionId   (key)                   ← Consumer 2 precomputed lookup
 *   - candidateId  (key)                   ← reverse lookup
 *   - [questionId + status]  (key)         ← filter confirmed/suggested
 *   - hybridScore  (key)                   ← orderDesc for top-3 selection
 *   - status       (key)
 *
 * duplicate_feedback:
 *   - sessionId    (key)
 *   - userId       (key)
 *   - action       (key)                   ← weekly recalibration aggregation
 *   - createdAt    (key)                   ← time-windowed queries
 *
 * evaluation_snapshots:
 *   - weekStartDate  (unique)              ← one snapshot per week
 */

export const SIMILARITY_COLLECTIONS = {
  EMBEDDINGS: questionEmbeddingsCollection,
  CANDIDATES: similarityCandidatesCollection,
  FEEDBACK: duplicateFeedbackCollection,
  SNAPSHOTS: evaluationSnapshotsCollection,
} as const;
