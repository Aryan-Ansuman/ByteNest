// ─── question_embeddings ──────────────────────────────────────────────────────

export type EmbeddingStatus =
  | "pending"
  | "generating"
  | "complete"
  | "failed"
  | "stale";

export type QuestionEmbedding = {
  $id?: string;
  questionId: string;
  embeddingVector: number[];     // stored as JSON string in Appwrite, deserialized on read
  embeddingInput: string;        // exact text embedded — stored for re-embedding reproducibility
  embeddingModel: string;        // e.g. "text-embedding-3-small" or "embed-english-v3.0"
  embeddingVersion: number;      // increments on model upgrades — stale detection
  embeddingStatus: EmbeddingStatus;
  lastEmbeddedAt: string | null;
  contentHash: string;           // SHA-256 of embeddingInput — detects content drift
  dimensions: number;            // vector size — validated on write
};

// ─── similarity_candidates ────────────────────────────────────────────────────

export type DetectionMethod = "embedding_search" | "tag_overlap" | "moderator";

export type CandidateStatus = "suggested" | "confirmed" | "rejected" | "merged";

export type SimilarityCandidate = {
  $id?: string;
  questionId: string;            // source question
  candidateId: string;           // the similar question
  hybridScore: number;           // final composite score from ranking formula
  semanticScore: number;         // cosine similarity component
  tagOverlapScore: number;       // Jaccard tag intersection component
  intentMatchScore: number | null; // null when either intent is uncertain
  communityScore: number;        // quality signal (votes + accepted answer)
  explanationTokens: string[];   // human-readable reasons — stored as JSON string
  detectionMethod: DetectionMethod;
  status: CandidateStatus;
  confirmedBy: string | null;    // userId or "system"
  createdAt: string;
  confirmedAt: string | null;
};

// ─── duplicate_feedback ───────────────────────────────────────────────────────

export type FeedbackAction =
  | "clicked"
  | "ignored"
  | "posted_anyway"
  | "abandoned"
  | "reported_not_duplicate";

export type DuplicateFeedback = {
  $id?: string;
  sessionId: string;             // posting session id — not userId, allows anonymous feedback
  userId: string | null;         // null for unauthenticated sessions
  sourceQuestionTitle: string;   // stored even if user abandoned without posting
  suggestedCandidateId: string;
  rank: 1 | 2 | 3;              // position shown (1-indexed)
  action: FeedbackAction;
  timeToActionMs: number;        // milliseconds from suggestion shown to action taken
  intentLabel: string;           // intent classification of the source question
  createdAt: string;
};

// ─── evaluation_snapshots ─────────────────────────────────────────────────────

export type EvaluationSnapshot = {
  $id?: string;
  weekStartDate: string;                  // ISO date — Monday of the evaluated week
  duplicatePreventionRate: number;        // fraction: clicked suggestion + did not post
  falsePositiveRate: number;              // fraction: confirmed duplicates rejected by users
  suggestionCTR: number;                  // fraction: sessions with at least one click
  abandonmentRate: number;               // fraction: clicked then abandoned posting flow
  moderatorDuplicateActions: number;     // raw count of moderator-confirmed duplicates
  avgSimilarityScoreAtConfirmation: number;
  avgSimilarityScoreAtRejection: number;
};
