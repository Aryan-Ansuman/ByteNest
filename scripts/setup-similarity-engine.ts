import createGraphNodesCollection from "../src/models/server/graph-nodes.collection";
import createGraphEdgesCollection from "../src/models/server/graph-edges.collection";
import createTagCooccurrenceCollection from "../src/models/server/tag-cooccurrence.collection";
import createQuestionEmbeddingsCollection from "../src/models/server/question-embeddings.collection";
import createEventQueueCollection from "../src/models/server/event-queue.collection";
import createSimilarityCandidatesCollection from "../src/models/server/similarity-candidates.collection";
import createDuplicateFeedbackCollection from "../src/models/server/duplicate-feedback.collection";
import createEvaluationSnapshotsCollection from "../src/models/server/evaluation-snapshots.collection";
import createTechnologyTermsCollection from "../src/models/server/technology-terms.collection";

async function main() {
    console.log("Setting up Similarity Engine collections...");
    try {
        await Promise.all([
            createGraphNodesCollection(),
            createGraphEdgesCollection(),
            createTagCooccurrenceCollection(),
            createQuestionEmbeddingsCollection(),
            createEventQueueCollection(),
            createSimilarityCandidatesCollection(),
            createDuplicateFeedbackCollection(),
            createEvaluationSnapshotsCollection(),
            createTechnologyTermsCollection(),
        ]);
        console.log("✅ Successfully created all collections for Contextual Question Similarity Engine!");
    } catch (error) {
        console.error("❌ Failed to create collections:", error);
    }
}

main().catch(console.error);
