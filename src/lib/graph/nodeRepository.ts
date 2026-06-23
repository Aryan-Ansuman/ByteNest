import { databases } from "@/models/server/config";
import { db as DB } from "@/models/name";
import { GRAPH_COLLECTIONS } from "./collections";
import { makeNodeKey } from "./nodeKey";
import type {
  GraphNode,
  NodeType,
  NodeAttrs,
  QuestionNodeAttrs,
  TagNodeAttrs,
} from "./types";

const COL = GRAPH_COLLECTIONS.NODES;

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Upsert a graph node. Uses the nodeKey as the Appwrite document $id so
 * repeated upserts are idempotent — safe to call on every question creation.
 */
export async function upsertNode(
  nodeType: NodeType,
  nodeId: string,
  attrs: NodeAttrs
): Promise<GraphNode> {
  const nodeKey = makeNodeKey(nodeType, nodeId);
  const now = new Date().toISOString();

  const payload = {
    nodeType,
    nodeId,
    attrs: JSON.stringify(attrs),
    updatedAt: now,
  };

  try {
    // Attempt update first (document already exists)
    const doc = await databases.updateDocument(DB, COL, nodeKey, payload);
    return deserializeNode(doc);
  } catch {
    // Document does not exist — create it
    const doc = await databases.createDocument(DB, COL, nodeKey, {
      ...payload,
      createdAt: now,
    });
    return deserializeNode(doc);
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getNode(
  nodeType: NodeType,
  nodeId: string
): Promise<GraphNode | null> {
  const nodeKey = makeNodeKey(nodeType, nodeId);
  try {
    const doc = await databases.getDocument(DB, COL, nodeKey);
    return deserializeNode(doc);
  } catch {
    return null;
  }
}

// ─── Question node helpers ────────────────────────────────────────────────────

export async function upsertQuestionNode(
  questionId: string,
  attrs: QuestionNodeAttrs
): Promise<GraphNode> {
  return upsertNode("question", questionId, attrs);
}

export async function upsertTagNode(
  tagName: string,
  attrs: TagNodeAttrs
): Promise<GraphNode> {
  return upsertNode("tag", tagName, attrs);
}

// ─── Quality score derivation ─────────────────────────────────────────────────

/**
 * Derives a 0–1 quality score from vote count and answer count.
 * Used as the community engagement signal in the Stage 2 hybrid formula.
 */
export function deriveQualityScore(voteCount: number, answerCount: number): number {
  const voteFactor = Math.max(0, voteCount) / 100; // normalize; cap at 100 votes
  const answerFactor = answerCount > 0 ? 1.0 : 0.4;
  return parseFloat(Math.min(1.0, voteFactor * 0.6 + answerFactor * 0.4).toFixed(4));
}

// ─── Serialization ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeNode(doc: any): GraphNode {
  return {
    nodeKey: doc.$id,
    nodeType: doc.nodeType,
    nodeId: doc.nodeId,
    attrs: typeof doc.attrs === "string" ? JSON.parse(doc.attrs) : doc.attrs,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
