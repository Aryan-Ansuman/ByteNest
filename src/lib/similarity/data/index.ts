export {
  createPendingEmbedding,
  writeCompletedEmbedding,
  setStatus,
  getByQuestionId,
  getBatchByQuestionIds,
  pollPendingEmbeddings,
  markModelStale,
  isContentDrifted,
} from "./embeddingRepository";

export {
  upsertCandidate,
  confirmCandidate,
  rejectCandidate,
  getRelatedQuestions,
  getCandidatesForRecalibration,
} from "./candidateRepository";

export {
  recordFeedback,
  getFeedbackSince,
  getFeedbackBySession,
  FEEDBACK_SIGNAL_WEIGHTS,
} from "./feedbackRepository";

export {
  upsertSnapshot,
  getByWeek,
  getTrailingSnapshots,
} from "./snapshotRepository";

export type {
  EmbeddingStatus,
  QuestionEmbedding,
  DetectionMethod,
  CandidateStatus,
  SimilarityCandidate,
  FeedbackAction,
  DuplicateFeedback,
  EvaluationSnapshot,
} from "./types";
