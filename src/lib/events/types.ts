// ─── Event payloads ───────────────────────────────────────────────────────────

export type QuestionDraftUpdatedPayload = {
  sessionId: string;
  draftTitle: string;
  draftBody: string;
  draftTags: string[];
  userId: string | null;
  userExpertiseTags?: Record<string, string>;
};

export type EmbeddingRequestedPayload = {
  questionId: string;
  embeddingInput: string;
  contentHash: string;
  triggeredBy: "question_created" | "content_changed" | "model_upgrade";
};

export type EmbeddingGeneratedPayload = {
  questionId: string;
  embeddingModel: string;
  embeddingVersion: number;
  dimensions: number;
  contentHash: string;
};

export type EmbeddingFailedPayload = {
  questionId: string;
  retryCount: number;
  errorMessage: string;
  nextRetryAt: string; // ISO — computed with exponential backoff
};

export type QuestionCreatedPayload = {
  questionId: string;
  title: string;
  body: string;
  tags: string[];
  authorId: string;
  sessionId: string | null;         // links back to draft session for dedup
  embeddingAlreadyComplete: boolean; // true if draft flow already generated it
  tagQuestionCounts: Record<string, number>;
};

export type DuplicateSuggestedPayload = {
  sessionId: string;
  userId: string | null;
  sourceQuestionTitle: string;
  intentLabel: string;
  candidates: Array<{
    candidateId: string;
    rank: 1 | 2 | 3;
    hybridScore: number;
    explanationTokens: string[];
  }>;
};

export type DuplicateConfirmedPayload = {
  sessionId: string;
  userId: string | null;
  sourceQuestionId: string | null;  // null if user abandoned before posting
  candidateId: string;
  rank: 1 | 2 | 3;
  timeToActionMs: number;
  confirmedBy: "user" | "moderator";
  moderatorId: string | null;
};

export type DuplicateRejectedPayload = {
  sessionId: string;
  userId: string | null;
  sourceQuestionId: string | null;
  candidateId: string;
  rank: 1 | 2 | 3;
  timeToActionMs: number;
};

// ─── Discriminated union ──────────────────────────────────────────────────────

export type EventType =
  | "QuestionDraftUpdated"
  | "EmbeddingRequested"
  | "EmbeddingGenerated"
  | "EmbeddingFailed"
  | "QuestionCreated"
  | "DuplicateSuggested"
  | "DuplicateConfirmed"
  | "DuplicateRejected";

export type EventPayloadMap = {
  QuestionDraftUpdated: QuestionDraftUpdatedPayload;
  EmbeddingRequested: EmbeddingRequestedPayload;
  EmbeddingGenerated: EmbeddingGeneratedPayload;
  EmbeddingFailed: EmbeddingFailedPayload;
  QuestionCreated: QuestionCreatedPayload;
  DuplicateSuggested: DuplicateSuggestedPayload;
  DuplicateConfirmed: DuplicateConfirmedPayload;
  DuplicateRejected: DuplicateRejectedPayload;
};

export type TypedEvent<T extends EventType = EventType> = {
  eventType: T;
  payload: EventPayloadMap[T];
};

// ─── Queue document ───────────────────────────────────────────────────────────

export type EventStatus = "pending" | "processing" | "complete" | "failed";

export type QueuedEvent = {
  $id?: string;
  eventType: EventType;
  payload: string;          // JSON-serialized EventPayloadMap[EventType]
  status: EventStatus;
  dedupKey: string;         // SHA-256(eventType + primary payload fields)
  retryCount: number;
  createdAt: string;
  processedAt: string | null;
};
