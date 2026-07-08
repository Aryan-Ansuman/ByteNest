import { db, systemConfigCollection, scoringWeightsCollection } from "../name";
import createAnswerCollection from "./answer.collection";
import createCommentCollection from "./comment.collection";
import createQuestionCollection from "./question.collection";
import createRateLimitCollection from "./rate-limit.collection";
import createVoteCollection from "./vote.collection";
import createUserSkillScoresCollection from "./user-skill-scores.collection";
import createSkillCalculationEventsCollection from "./skill-calculation-events.collection";
import createTagExpertRegistryCollection from "./tag-expert-registry.collection";
import createReputationEventsCollection from "./reputation-events.collection";
import createGraphNodesCollection from "./graph-nodes.collection";
import createGraphEdgesCollection from "./graph-edges.collection";
import createTagCooccurrenceCollection from "./tag-cooccurrence.collection";
import createQuestionEmbeddingsCollection from "./question-embeddings.collection";
import createEventQueueCollection from "./event-queue.collection";
import createSimilarityCandidatesCollection from "./similarity-candidates.collection";
import createDuplicateFeedbackCollection from "./duplicate-feedback.collection";
import createEvaluationSnapshotsCollection from "./evaluation-snapshots.collection";
import createTechnologyTermsCollection from "./technology-terms.collection";
import createDiscussionRoomsCollection from "./discussion-rooms.collection";
import createRoomMessagesCollection from "./room-messages.collection";
import createRoomMembersCollection from "./room-members.collection";
import createCodeSessionsCollection from "./code-sessions.collection";
import createCollabMessagesCollection from "./collab-messages.collection";
import createTypingIndicatorsCollection from "./typing-indicators.collection";
import createCodeCommentsCollection from "./code-comments.collection";
import createTestRunsCollection from "./test-runs.collection";
import createStalenessVotesCollection from "./staleness-votes.collection";
import createPackageReleaseCacheCollection from "./package-release-cache.collection";
import createTechPackageMapCollection from "./tech-package-map.collection";
import createFreshnessNotificationsCollection from "./freshness-notifications.collection";
import createFreshnessSnapshotsCollection from "./freshness-snapshots.collection";
import createNotificationsCollection from "./notifications.collection";
import { databases } from "./config";
import { freshnessNotificationsCollection, freshnessSnapshotsCollection, notificationsCollection, smellFeedbackCollection, smellAccuracySnapshotsCollection } from "../name";
import createSmellFeedbackCollection from "./smell-feedback.collection";
import createSmellAccuracySnapshotsCollection from "./smell-accuracy-snapshots.collection";
import createWebhookSecretStateCollection from "./webhook-secret-state.collection";
import { githubWebhookRegistrationsCollection, prQuestionMetadataCollection, processedWebhookEventsCollection, webhookSecretStateCollection } from "../name";
import createGithubWebhookRegistrationsCollection from "./github-webhook-registrations.collection";
import createPrQuestionMetadataCollection from "./pr-question-metadata.collection";
import createProcessedWebhookEventsCollection from "./processed-webhook-events.collection";

export default async function getOrCreateDB(){
  try {
    await databases.get(db)
    console.log("Database connection")
    // 7. Scoring Weights
    try {
      await databases.getCollection(db, scoringWeightsCollection);
    } catch (error) {
      console.log(`Creating collection ${scoringWeightsCollection}`);
      await databases.createCollection(db, scoringWeightsCollection, scoringWeightsCollection);
    }

    // 8. System Config
    try {
      await databases.getCollection(db, systemConfigCollection);
    } catch (error) {
      console.log(`Creating collection ${systemConfigCollection}`);
      await databases.createCollection(db, systemConfigCollection, systemConfigCollection);
    }

    // 9. Test Runs (TVA) — added after initial DB creation, so it needs its
    // own existence check on the "DB already exists" path.
    try {
      await databases.getCollection(db, "test_runs");
    } catch (error) {
      console.log("Creating collection test_runs");
      await createTestRunsCollection();
    }

    // 10. Temporal Answer Decay (Phase 4)
    try {
      await databases.getCollection(db, "staleness_votes");
    } catch (error) {
      console.log("Creating Temporal Decay collections");
      await Promise.all([
        createStalenessVotesCollection(),
        createPackageReleaseCacheCollection(),
        createTechPackageMapCollection(),
      ]);
    }

    // 12. Temporal Answer Decay — freshness_notifications
    try {
      await databases.getCollection(db, freshnessNotificationsCollection);
    } catch (error) {
      console.log(`Creating collection ${freshnessNotificationsCollection}`);
      await createFreshnessNotificationsCollection();
    }

    // 13. Temporal Answer Decay — freshness_snapshots
    try {
      await databases.getCollection(db, freshnessSnapshotsCollection);
    } catch (error) {
      console.log(`Creating collection ${freshnessSnapshotsCollection}`);
      await createFreshnessSnapshotsCollection();
    }

    // 14. Temporal Answer Decay — notifications (Phase 7)
    try {
      await databases.getCollection(db, notificationsCollection);
    } catch (error) {
      console.log(`Creating collection ${notificationsCollection}`);
      await createNotificationsCollection();
    }

    // N+1. Code Smell Auto-Tagger — smell_feedback
    try {
      await databases.getCollection(db, smellFeedbackCollection);
    } catch (error) {
      console.log(`Creating collection ${smellFeedbackCollection}`);
      await createSmellFeedbackCollection();
    }

    // N+2. Code Smell Auto-Tagger — smell_accuracy_snapshots
    try {
      await databases.getCollection(db, smellAccuracySnapshotsCollection);
    } catch (error) {
      console.log(`Creating collection ${smellAccuracySnapshotsCollection}`);
      await createSmellAccuracySnapshotsCollection();
    }


    // Phase 4 — PR-Linked Q&A — pr_question_metadata
    try {
      await databases.getCollection(db, prQuestionMetadataCollection);
    } catch (error) {
      console.log(`Creating collection ${prQuestionMetadataCollection}`);
      await createPrQuestionMetadataCollection();
    }

    // N+3. PR-Linked Q&A — processed_webhook_events (Phase 4 idempotency guard)
    try {
      await databases.getCollection(db, processedWebhookEventsCollection);
    } catch (error) {
      console.log(`Creating collection ${processedWebhookEventsCollection}`);
      await createProcessedWebhookEventsCollection();
    }

    // N+4. PR-Linked Q&A — github_webhook_registrations (Phase 7)
    try {
      await databases.getCollection(db, githubWebhookRegistrationsCollection);
    } catch (error) {
      console.log(`Creating collection ${githubWebhookRegistrationsCollection}`);
      await createGithubWebhookRegistrationsCollection();
    }

    // N+5. PR-Linked Q&A — webhook_secret_state (Phase 7 secret rotation)
    try {
      await databases.getCollection(db, webhookSecretStateCollection);
    } catch (error) {
      console.log(`Creating collection ${webhookSecretStateCollection}`);
      await createWebhookSecretStateCollection();
    }
  } catch (error) {
    try {
      await databases.create(db, db)
      console.log("database created")
      //create collections
      await Promise.all([
        createQuestionCollection(),
        createAnswerCollection(),
        createCommentCollection(),
        createVoteCollection(),
        createRateLimitCollection(),
        // Phase 1 — Skill Analytics
        createUserSkillScoresCollection(),
        createSkillCalculationEventsCollection(),
        createTagExpertRegistryCollection(),
        // Reputation Trajectory — Phase 1
        createReputationEventsCollection(),
        // Contextual Question Similarity Engine
        createGraphNodesCollection(),
        createGraphEdgesCollection(),
        createTagCooccurrenceCollection(),
        createQuestionEmbeddingsCollection(),
        createEventQueueCollection(),
        createSimilarityCandidatesCollection(),
        createDuplicateFeedbackCollection(),
        createEvaluationSnapshotsCollection(),
        createTechnologyTermsCollection(),
        // Phase 3 — Discussion Rooms
        createDiscussionRoomsCollection(),
        createRoomMessagesCollection(),
        createRoomMembersCollection(),
        createCodeSessionsCollection(),
        createCollabMessagesCollection(),
        createTypingIndicatorsCollection(),
        // Test-Verified Answers (TVA) — Phase 1
        createTestRunsCollection(),
        // Temporal Answer Decay — Phase 1
        createStalenessVotesCollection(),
        createPackageReleaseCacheCollection(),
        createTechPackageMapCollection(),
        createFreshnessNotificationsCollection(),
        createFreshnessSnapshotsCollection(),
        createNotificationsCollection(),
        createSmellFeedbackCollection(),
        createSmellAccuracySnapshotsCollection(),

        createPrQuestionMetadataCollection(),
        createProcessedWebhookEventsCollection(),
        createGithubWebhookRegistrationsCollection(),
        createWebhookSecretStateCollection(),
      ])
      console.log("Collection created")
      console.log("Database connected")
    } catch (error) {
      console.log("Error creating databases or collection", error)
    }
  }

  return databases
}
