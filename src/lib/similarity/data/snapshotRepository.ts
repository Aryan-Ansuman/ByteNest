import { databases } from "@/models/server/config";
import { db as DB } from "@/models/name";
import { ID, Query } from "node-appwrite";
import { SIMILARITY_COLLECTIONS } from "./collections";
import type { EvaluationSnapshot } from "./types";

const COL = SIMILARITY_COLLECTIONS.SNAPSHOTS;

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Upserts the weekly snapshot by weekStartDate.
 * One document per week — idempotent on retry.
 */
export async function upsertSnapshot(
  snapshot: Omit<EvaluationSnapshot, "$id">
): Promise<EvaluationSnapshot> {
  const existing = await getByWeek(snapshot.weekStartDate);

  if (existing?.$id) {
    const doc = await databases.updateDocument(DB, COL, existing.$id, snapshot);
    return deserialize(doc);
  }

  const doc = await databases.createDocument(DB, COL, ID.unique(), snapshot);
  return deserialize(doc);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getByWeek(
  weekStartDate: string
): Promise<EvaluationSnapshot | null> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("weekStartDate", weekStartDate),
    Query.limit(1),
  ]);

  if (res.documents.length === 0) return null;
  return deserialize(res.documents[0]);
}

/**
 * Returns the trailing N weeks of snapshots for metric alerting.
 * Phase 10 uses this for two-standard-deviation checks.
 */
export async function getTrailingSnapshots(
  weeks = 4
): Promise<EvaluationSnapshot[]> {
  const res = await databases.listDocuments(DB, COL, [
    Query.orderDesc("weekStartDate"),
    Query.limit(weeks),
  ]);

  return res.documents.map(deserialize);
}

// ─── Serialization ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserialize(doc: any): EvaluationSnapshot {
  return {
    $id: doc.$id,
    weekStartDate: doc.weekStartDate,
    duplicatePreventionRate: doc.duplicatePreventionRate,
    falsePositiveRate: doc.falsePositiveRate,
    suggestionCTR: doc.suggestionCTR,
    abandonmentRate: doc.abandonmentRate,
    moderatorDuplicateActions: doc.moderatorDuplicateActions,
    avgSimilarityScoreAtConfirmation: doc.avgSimilarityScoreAtConfirmation,
    avgSimilarityScoreAtRejection: doc.avgSimilarityScoreAtRejection,
  };
}
