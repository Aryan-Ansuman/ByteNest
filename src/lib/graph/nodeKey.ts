import type { NodeType } from "./types";

/**
 * Composite node key: "nodeType:nodeId"
 * Used as the Appwrite document $id in graph_nodes so queries never need a
 * secondary index to look up a node — the key IS the document id.
 */
export function makeNodeKey(nodeType: NodeType, nodeId: string): string {
  return `${nodeType}:${nodeId}`;
}

export function parseNodeKey(key: string): { nodeType: NodeType; nodeId: string } {
  const colon = key.indexOf(":");
  if (colon === -1) throw new Error(`Invalid node key: ${key}`);
  return {
    nodeType: key.slice(0, colon) as NodeType,
    nodeId: key.slice(colon + 1),
  };
}

/** Alphabetically sorted pair key for undirected tag co-occurrence rows. */
export function makeCooccurrencePairKey(tagA: string, tagB: string): string {
  return [tagA, tagB].sort().join("|");
}
