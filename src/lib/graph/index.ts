export { wireQuestionIntoGraph } from "./graphService";
export type { QuestionGraphInput } from "./graphService";

export { getEdgesFromSource, getEdgesToTarget, createEdge, confirmSimilarityEdge, rejectSimilarityEdge } from "./edgeRepository";
export { getStrongestCooccurrences } from "./cooccurrenceRepository";
export { getNode } from "./nodeRepository";
export { makeNodeKey, parseNodeKey, makeCooccurrencePairKey } from "./nodeKey";

export type {
  GraphNode,
  GraphEdge,
  TagCooccurrence,
  NodeType,
  EdgeType,
  QuestionNodeAttrs,
  TagNodeAttrs,
  UserNodeAttrs,
  AnswerNodeAttrs,
  ConceptNodeAttrs,
  QuestionSimilarityEdgeAttrs,
} from "./types";
