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

// Phase 4 - Test-Verified Answers
export const testRunsCollection = "test_runs"

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
    // TVA — Phase 7: machine-confirmed correctness, weighted above a normal
    // upvote since it isn't a popularity signal.
    "answer_verified",
] as const;

export type ReputationEventType = (typeof REPUTATION_EVENT_TYPES)[number];

export const REPUTATION_SOURCE_TYPES = [
    "vote",
    "answer",
    "question",
    "system",
    // TVA — sourceId points at the test_runs document, not the answer
    // itself, so a retroactive re-pass creates a distinct, dedupable event.
    "test_run",
] as const;

export type ReputationSourceType = (typeof REPUTATION_SOURCE_TYPES)[number];


// TVA — reputation bonus for a machine-verified pass. Deliberately higher
// than a normal upvote (+5) and higher than acceptance (+10) — it's the
// strongest signal in the system because it's not crowd-sourced.
export const TVA_VERIFIED_REPUTATION_BONUS = 15;

// ─── Test-Verified Answers ────────────────────────────────────────────────

export const VERIFICATION_STATUS = [
    "unverified",
    "pending",
    "processing",
    "passed",
    "failed",
    "error",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

export const TEST_FRAMEWORKS = [
    "jest",
    "pytest",
    "vitest",
    "cargo-test",
    "go-test",
] as const;

export type TestFramework = (typeof TEST_FRAMEWORKS)[number];

// Phase 3 — Discussion Rooms
export const discussionRoomsCollection = "discussion_rooms";
export const roomMessagesCollection = "room_messages";
export const roomMembersCollection = "room_members";
export const codeSessionsCollection = "code_sessions";
export const collabMessagesCollection = "collab_messages";
export const typingIndicatorsCollection = "typing_indicators";
export const codeCommentsCollection = "code_comments";

// Phase 4 — Temporal Decay
export const stalenessVotesCollection = "staleness_votes";
export const packageReleaseCacheCollection = "package_release_cache";
export const techPackageMapCollection = "tech_package_map";
export const freshnessNotificationsCollection = "freshness_notifications";
export const freshnessSnapshotsCollection = "freshness_snapshots";
export const notificationsCollection = "notifications";
export const NOTIFICATION_TYPES = ["answer_outdated"] as const;

export { TECH_ECOSYSTEMS, FRESHNESS_LABELS } from "@/lib/decay/types";
export type { TechEcosystem, FreshnessLabel } from "@/lib/decay/types";

// Phase 5 — Code Smell Auto-Tagger
export { SMELL_ANALYSIS_STATUSES, SMELL_CATALOG, SMELL_IDS } from "@/lib/smells/catalog";
export type { SmellAnalysisStatus, SmellId } from "@/lib/smells/catalog";

// Phase 7 - Community Feedback Loop
export const smellFeedbackCollection = "smell_feedback";
export const smellAccuracySnapshotsCollection = "smell_accuracy_snapshots";
