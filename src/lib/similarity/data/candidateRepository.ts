import { databases } from "@/models/server/config";
import { db as DB } from "@/models/name";
import { ID, Query } from "node-appwrite";
import { SIMILARITY_COLLECTIONS } from "./collections";
import type { SimilarityCandidate, CandidateStatus, DetectionMethod } from "./types";

const COL = SIMILARITY_COLLECTIONS.CANDIDATES;

// ─── Write ────────────────────────────────────────────────────────────────────

export async function upsertCandidate(
  candidate: Omit<SimilarityCandidate, "$id" | "createdAt" | "confirmedAt" | "confirmedBy">
): Promise<SimilarityCandidate> {
  const existing = await getCandidatePair(candidate.questionId, candidate.candidateId);
  const now = new Date().toISOString();

  const payload = {
    questionId: candidate.questionId,
    candidateId: candidate.candidateId,
    hybridScore: candidate.hybridScore,
    semanticScore: candidate.semanticScore,
    tagOverlapScore: candidate.tagOverlapScore,
    intentMatchScore: candidate.intentMatchScore ?? null,
    communityScore: candidate.communityScore,
    explanationTokens: JSON.stringify(candidate.explanationTokens),
    detectionMethod: candidate.detectionMethod,
    status: candidate.status,
    confirmedBy: null,
    confirmedAt: null,
  };

  if (existing?.$id) {
    const doc = await databases.updateDocument(DB, COL, existing.$id, payload);
    return deserialize(doc);
  }

  const doc = await databases.createDocument(DB, COL, ID.unique(), {
    ...payload,
    createdAt: now,
  });
  return deserialize(doc);
}

export async function confirmCandidate(
  questionId: string,
  candidateId: string,
  confirmedBy: string
): Promise<SimilarityCandidate | null> {
  const existing = await getCandidatePair(questionId, candidateId);
  if (!existing?.$id) return null;

  const doc = await databases.updateDocument(DB, COL, existing.$id, {
    status: "confirmed" satisfies CandidateStatus,
    confirmedBy,
    confirmedAt: new Date().toISOString(),
  });

  return deserialize(doc);
}

export async function rejectCandidate(
  questionId: string,
  candidateId: string,
  rejectedBy: string
): Promise<SimilarityCandidate | null> {
  const existing = await getCandidatePair(questionId, candidateId);
  if (!existing?.$id) return null;

  const doc = await databases.updateDocument(DB, COL, existing.$id, {
    status: "rejected" satisfies CandidateStatus,
    confirmedBy: rejectedBy,
    confirmedAt: new Date().toISOString(),
  });

  return deserialize(doc);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/**
 * Consumer 2: pre-computed related questions for the sidebar.
 * Returns top candidates by hybridScore for a given question.
 */
export async function getRelatedQuestions(
  questionId: string,
  limit = 5
): Promise<SimilarityCandidate[]> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("questionId", questionId),
    Query.equal("status", ["suggested", "confirmed"]),
    Query.orderDesc("hybridScore"),
    Query.limit(limit),
  ]);

  return res.documents.map(deserialize);
}

export async function getCandidatePair(
  questionId: string,
  candidateId: string
): Promise<SimilarityCandidate | null> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("questionId", questionId),
    Query.equal("candidateId", candidateId),
    Query.limit(1),
  ]);

  if (res.documents.length === 0) return null;
  return deserialize(res.documents[0]);
}

/**
 * Recalibration query: returns all confirmed + rejected pairs within a date window.
 * Used by the weekly feedback learning loop (Phase 9).
 */
export async function getCandidatesForRecalibration(
  since: string
): Promise<SimilarityCandidate[]> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("status", ["confirmed", "rejected"]),
    Query.greaterThan("confirmedAt", since),
    Query.limit(5000),
  ]);

  return res.documents.map(deserialize);
}

// ─── Serialization ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserialize(doc: any): SimilarityCandidate {
  return {
    $id: doc.$id,
    questionId: doc.questionId,
    candidateId: doc.candidateId,
    hybridScore: doc.hybridScore,
    semanticScore: doc.semanticScore,
    tagOverlapScore: doc.tagOverlapScore,
    intentMatchScore: doc.intentMatchScore ?? null,
    communityScore: doc.communityScore,
    explanationTokens:
      typeof doc.explanationTokens === "string"
        ? JSON.parse(doc.explanationTokens)
        : doc.explanationTokens,
    detectionMethod: doc.detectionMethod,
    status: doc.status,
    confirmedBy: doc.confirmedBy ?? null,
    createdAt: doc.createdAt,
    confirmedAt: doc.confirmedAt ?? null,
  };
}
