// ─── Node types ───────────────────────────────────────────────────────────────

export type NodeType = "question" | "tag" | "user" | "answer" | "concept";

export type QuestionNodeAttrs = {
  questionId: string;
  tags: string[];
  embeddingId: string | null;
  intentLabel: string;
  intentConfidence: number;
  qualityScore: number; // derived: votes + answer count signal
  createdAt: string;
};

export type TagNodeAttrs = {
  tagName: string;
  questionCount: number;
  relatedTagWeights: Record<string, number>; // tagName → co-occurrence strength
};

export type UserNodeAttrs = {
  userId: string;
  expertiseTags: Record<string, string>; // tagName → skill tier ("newcomer"|"intermediate"|"expert")
};

export type AnswerNodeAttrs = {
  answerId: string;
  questionId: string;
  authorId: string;
  voteScore: number;
};

export type ConceptNodeAttrs = {
  conceptName: string;       // e.g. "React Ecosystem"
  memberTags: string[];      // e.g. ["react","react-hooks","react-native","jsx"]
};

export type NodeAttrs =
  | QuestionNodeAttrs
  | TagNodeAttrs
  | UserNodeAttrs
  | AnswerNodeAttrs
  | ConceptNodeAttrs;

export type GraphNode = {
  nodeKey: string;           // composite "nodeType:nodeId" — the Appwrite document $id
  nodeType: NodeType;
  nodeId: string;
  attrs: NodeAttrs;
  createdAt: string;
  updatedAt: string;
};

// ─── Edge types ───────────────────────────────────────────────────────────────

export type EdgeType =
  | "question_similar_to"    // Q → Q  (similarity engine)
  | "question_has_tag"       // Q → Tag
  | "tag_cooccurs_with"      // Tag → Tag
  | "user_expert_in"         // User → Tag
  | "concept_includes_tag";  // Concept → Tag

export type QuestionSimilarityEdgeAttrs = {
  similarityScore: number;
  semanticScore: number;
  tagOverlap: number;
  intentMatch: boolean | null;
  detectedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null; // userId or "system"
  status: "suggested" | "confirmed" | "rejected";
};

export type TagCooccurrenceEdgeAttrs = {
  cooccurrenceCount: number;
};

export type UserExpertiseEdgeAttrs = {
  skillTier: "newcomer" | "intermediate" | "expert";
  updatedAt: string;
};

export type EdgeAttrs =
  | QuestionSimilarityEdgeAttrs
  | TagCooccurrenceEdgeAttrs
  | UserExpertiseEdgeAttrs
  | Record<string, never>; // empty for simple structural edges

export type GraphEdge = {
  $id?: string;
  sourceId: string;   // nodeKey of source
  targetId: string;   // nodeKey of target
  edgeType: EdgeType;
  weight: number;     // primary numeric weight for this edge type
  attrs: EdgeAttrs;
  createdAt: string;
  updatedAt: string;
};

// ─── Tag co-occurrence matrix row ─────────────────────────────────────────────

export type TagCooccurrence = {
  $id?: string;
  pairKey: string;   // "tagA|tagB" always alphabetically sorted — ensures uniqueness
  tagA: string;
  tagB: string;
  strength: number;  // increment by 1 on each question creation with both tags
  updatedAt: string;
};
