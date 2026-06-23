import { databases } from "@/models/server/config";
import { db as DB } from "@/models/name";
import { ID, Query } from "node-appwrite";
import { GRAPH_COLLECTIONS } from "./collections";
import type { GraphEdge, EdgeType, EdgeAttrs } from "./types";

const COL = GRAPH_COLLECTIONS.EDGES;

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createEdge(
  sourceId: string,
  targetId: string,
  edgeType: EdgeType,
  weight: number,
  attrs: EdgeAttrs
): Promise<GraphEdge> {
  const now = new Date().toISOString();

  const doc = await databases.createDocument(DB, COL, ID.unique(), {
    sourceId,
    targetId,
    edgeType,
    weight,
    attrs: JSON.stringify(attrs),
    createdAt: now,
  });

  return deserializeEdge(doc);
}

// ─── Upsert (idempotent for structural edges) ─────────────────────────────────

/**
 * Upserts a structural edge (e.g. question_has_tag) where exactly one edge
 * of this type should exist between a given source/target pair.
 */
export async function upsertStructuralEdge(
  sourceId: string,
  targetId: string,
  edgeType: EdgeType,
  weight: number,
  attrs: EdgeAttrs
): Promise<GraphEdge> {
  const existing = await getEdge(sourceId, targetId, edgeType);

  if (existing) {
    const doc = await databases.updateDocument(DB, COL, existing.$id!, {
      weight,
      attrs: JSON.stringify(attrs),
    });
    return deserializeEdge(doc);
  }

  return createEdge(sourceId, targetId, edgeType, weight, attrs);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getEdge(
  sourceId: string,
  targetId: string,
  edgeType: EdgeType
): Promise<GraphEdge | null> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("sourceId", sourceId),
    Query.equal("targetId", targetId),
    Query.equal("edgeType", edgeType),
    Query.limit(1),
  ]);

  if (res.documents.length === 0) return null;
  return deserializeEdge(res.documents[0]);
}

/**
 * Get all edges of a given type from a source node.
 * Used in Stage 1: question → question_has_tag → tag nodeKeys.
 */
export async function getEdgesFromSource(
  sourceId: string,
  edgeType: EdgeType,
  limit = 50
): Promise<GraphEdge[]> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("sourceId", sourceId),
    Query.equal("edgeType", edgeType),
    Query.limit(limit),
  ]);

  return res.documents.map(deserializeEdge);
}

/**
 * Get all edges of a given type pointing to a target node.
 * Used in Stage 1: tag → question_has_tag (reverse) → question nodeKeys.
 */
export async function getEdgesToTarget(
  targetId: string,
  edgeType: EdgeType,
  limit = 500
): Promise<GraphEdge[]> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("targetId", targetId),
    Query.equal("edgeType", edgeType),
    Query.limit(limit),
  ]);

  return res.documents.map(deserializeEdge);
}

// ─── Update similarity edge status ───────────────────────────────────────────

export async function confirmSimilarityEdge(
  edgeId: string,
  confirmedBy: string
): Promise<GraphEdge> {
  const now = new Date().toISOString();
  const doc = await databases.getDocument(DB, COL, edgeId);
  const attrs = JSON.parse(doc.attrs);

  const updated = await databases.updateDocument(DB, COL, edgeId, {
    attrs: JSON.stringify({
      ...attrs,
      status: "confirmed",
      confirmedAt: now,
      confirmedBy,
    }),
  });

  return deserializeEdge(updated);
}

export async function rejectSimilarityEdge(
  edgeId: string,
  rejectedBy: string
): Promise<GraphEdge> {
  const now = new Date().toISOString();
  const doc = await databases.getDocument(DB, COL, edgeId);
  const attrs = JSON.parse(doc.attrs);

  const updated = await databases.updateDocument(DB, COL, edgeId, {
    attrs: JSON.stringify({
      ...attrs,
      status: "rejected",
      confirmedAt: now,
      confirmedBy: rejectedBy,
    }),
  });

  return deserializeEdge(updated);
}

// ─── Serialization ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeEdge(doc: any): GraphEdge {
  return {
    $id: doc.$id,
    sourceId: doc.sourceId,
    targetId: doc.targetId,
    edgeType: doc.edgeType,
    weight: doc.weight,
    attrs: typeof doc.attrs === "string" ? JSON.parse(doc.attrs) : doc.attrs,
    createdAt: doc.createdAt,
    updatedAt: doc.$updatedAt, // Appwrite tracks this automatically
  };
}
