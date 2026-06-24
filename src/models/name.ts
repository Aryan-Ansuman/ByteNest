export const db = "6a2bbffd00190eccf0b8"
export const questionCollection = "questions"
export const answerCollection = "answers"
export const commentCollection = "comments"
export const voteCollection = "votes"
export const userSkillScoresCollection = "user_skill_scores"
export const skillCalcEventsCollection = "skill_calculation_events"
export const tagExpertRegistryCollection = "tag_expert_registry"
export const rateLimitCollection = "rateLimits"
export const reputationEventsCollection = "reputation_events"
export const questionAttachmentBucket = "6a2c69730007121e8fdb"

// Phase 1 — Knowledge Graph
export const graphNodesCollection = "graph_nodes"
export const graphEdgesCollection = "graph_edges"
export const tagCooccurrenceCollection = "tag_cooccurrence"

// Phase 2 — Similarity Engine
export const questionEmbeddingsCollection = "question_embeddings"
export const eventQueueCollection = "event_queue"
export const technologyTermsCollection = "technology_terms"
export const similarityCandidatesCollection = "similarity_candidates"
export const duplicateFeedbackCollection = "duplicate_feedback";
export const scoringWeightsCollection = "scoring_weights";
export const similarityCacheCollection = "similarity_cache";
export const annIndexMetaCollection = "ann_index_meta";
export const systemConfigCollection = "system_config";
export const evaluationSnapshotsCollection = "evaluation_snapshots"

// ─── Reputation event types ────────────────────────────────────────────────
// Defined here so they can be imported by both the Next.js API layer
// (writeReputationEvent utility) and any future server utilities without
// duplicating the string literals.

export const REPUTATION_EVENT_TYPES = [
    "answer_upvoted",
    "answer_downvoted",
    "answer_upvote_removed",
    "answer_downvote_removed",
    "answer_accepted",
    "answer_acceptance_removed",
    "question_upvoted",
    "question_downvoted",
    "question_upvote_removed",
    "question_downvote_removed",
    "answer_posted",
    "answer_deleted",
    "manual_adjustment",
    "historical_baseline",
] as const;

export type ReputationEventType = (typeof REPUTATION_EVENT_TYPES)[number];

export const REPUTATION_SOURCE_TYPES = [
    "vote",
    "answer",
    "question",
    "system",
] as const;

export type ReputationSourceType = (typeof REPUTATION_SOURCE_TYPES)[number];

// Phase 3 — Discussion Rooms
export const discussionRoomsCollection = "discussion_rooms";
export const roomMessagesCollection = "room_messages";
export const roomMembersCollection = "room_members";
export const codeSessionsCollection = "code_sessions";
export const collabMessagesCollection = "collab_messages";
export const typingIndicatorsCollection = "typing_indicators";
