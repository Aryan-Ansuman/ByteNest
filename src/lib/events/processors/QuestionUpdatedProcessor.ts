import { buildEmbeddingInput } from "@/lib/similarity/nlp/buildEmbeddingInput";
import { publishEvent } from "../eventQueue";
import { databases } from "@/models/server/config";
import { db, questionEmbeddingsCollection } from "@/models/name";
import { Query } from "node-appwrite";
import { processQuestionCreated } from "./QuestionCreatedProcessor";

export type QuestionUpdatedPayload = {
  questionId: string;
  title: string;
  body: string;
  tags: string[];
};

export async function processQuestionUpdated(payload: QuestionUpdatedPayload) {
  const { questionId, title, body, tags } = payload;

  const docs = await databases.listDocuments(
    db,
    questionEmbeddingsCollection,
    [Query.equal('questionId', questionId), Query.limit(1)]
  );

  if (docs.total === 0) {
    // No embedding yet — treat same as QuestionCreated
    return processQuestionCreated({
      questionId,
      title,
      body,
      tags,
      authorId: "",
      embeddingAlreadyComplete: false,
      tagQuestionCounts: {}
    });
  }

  const doc = docs.documents[0];
  const { embeddingInput, contentHash: newHash } = await buildEmbeddingInput({
    title,
    body,
    tags,
  });

  // No change — nothing to do
  if (newHash === doc.contentHash) {
    return;
  }

  // Content changed — mark stale, update input, queue re-embedding
  await databases.updateDocument(
    db,
    questionEmbeddingsCollection,
    doc.$id,
    {
      embeddingStatus: 'stale',
      embeddingInput:  embeddingInput,
      contentHash:     newHash,
      // Old vector intentionally kept — still usable until regenerated
    }
  );

  await publishEvent('EmbeddingRequested', {
    questionId,
    priority: 'high',  // recently edited — prioritize
  });
}
