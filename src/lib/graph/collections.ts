import { graphNodesCollection, graphEdgesCollection, tagCooccurrenceCollection } from "@/models/name";

/**
 * Appwrite collection IDs for the knowledge graph.
 * Three collections represent the full graph structure per Step 3.3.
 *
 * graph_nodes       — all node types keyed by "nodeType:nodeId"
 * graph_edges       — all edge types with sourceId, targetId, edgeType, weight
 * tag_cooccurrence  — materialized co-occurrence matrix, updated incrementally
 */

export const GRAPH_COLLECTIONS = {
  NODES: graphNodesCollection,
  EDGES: graphEdgesCollection,
  TAG_COOCCURRENCE: tagCooccurrenceCollection,
} as const;

/**
 * Required Appwrite indexes — create these in the Appwrite console or via migration:
 *
 * graph_nodes:
 *   - $id (unique)                       ← the nodeKey IS the document id
 *   - nodeType (key)
 *
 * graph_edges:
 *   - sourceId (key)
 *   - targetId (key)
 *   - edgeType (key)
 *   - [sourceId + edgeType] (key)        ← Stage 1 tag filtering traversal
 *   - [targetId + edgeType] (key)        ← reverse traversal
 *
 * tag_cooccurrence:
 *   - pairKey (unique)                   ← prevents duplicate pairs
 *   - tagA (key)
 *   - tagB (key)
 */
