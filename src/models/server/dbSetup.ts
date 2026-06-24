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
import { databases } from "./config";

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
      ])
      console.log("Collection created")
      console.log("Database connected")
    } catch (error) {
      console.log("Error creating databases or collection", error)
    }
  }

  return databases
}
