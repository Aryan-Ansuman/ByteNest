import { databases } from "@/models/server/config";
import { db as DB } from "@/models/name";
import { ID, Query } from "node-appwrite";
import { SIMILARITY_COLLECTIONS } from "./collections";
import type { QuestionEmbedding, EmbeddingStatus } from "./types";

const COL = SIMILARITY_COLLECTIONS.EMBEDDINGS;

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Creates a pending embedding record when a question is first created.
 * The embedding job picks this up via pollPendingEmbeddings().
 */
export async function createPendingEmbedding(
  questionId: string,
  contentHash: string,
  embeddingInput: string
): Promise<QuestionEmbedding> {
  const doc = await databases.createDocument(DB, COL, ID.unique(), {
    questionId,
    embeddingVector: JSON.stringify([]),
    embeddingInput,
    embeddingModel: "",
    embeddingVersion: 0,
    embeddingStatus: "pending" satisfies EmbeddingStatus,
    lastEmbeddedAt: null,
    contentHash,
    dimensions: 0,
  });

  return deserialize(doc);
}

/**
 * Writes a completed embedding after a successful API call.
 * Transitions status: generating → complete.
 */
export async function writeCompletedEmbedding(
  questionId: string,
  vector: number[],
  embeddingInput: string,
  embeddingModel: string,
  embeddingVersion: number,
  contentHash: string
): Promise<QuestionEmbedding> {
  const existing = await getByQuestionId(questionId);
  if (!existing?.$id) throw new Error(`No embedding record for questionId: ${questionId}`);

  const doc = await databases.updateDocument(DB, COL, existing.$id, {
    embeddingVector: JSON.stringify(vector),
    embeddingInput,
    embeddingModel,
    embeddingVersion,
    embeddingStatus: "complete" satisfies EmbeddingStatus,
    lastEmbeddedAt: new Date().toISOString(),
    contentHash,
    dimensions: vector.length,
  });

  return deserialize(doc);
}

export async function setStatus(
  questionId: string,
  status: EmbeddingStatus
): Promise<void> {
  const existing = await getByQuestionId(questionId);
  if (!existing?.$id) return;

  await databases.updateDocument(DB, COL, existing.$id, {
    embeddingStatus: status,
  });
}

export async function incrementRetryAndFail(questionId: string): Promise<void> {
  await setStatus(questionId, "failed");
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getByQuestionId(
  questionId: string
): Promise<QuestionEmbedding | null> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("questionId", questionId),
    Query.limit(1),
  ]);

  if (res.documents.length === 0) return null;
  return deserialize(res.documents[0]);
}

/**
 * Fetches embeddings for a batch of questionIds.
 * Used by Stage 2 to retrieve candidate vectors for cosine similarity.
 */
export async function getBatchByQuestionIds(
  questionIds: string[]
): Promise<QuestionEmbedding[]> {
  if (questionIds.length === 0) return [];

  const res = await databases.listDocuments(DB, COL, [
    Query.equal("questionId", questionIds),
    Query.equal("embeddingStatus", "complete"),
    Query.limit(questionIds.length),
  ]);

  return res.documents.map(deserialize);
}

/**
 * Returns up to `limit` records in pending or failed status.
 * Polled by the embedding job function.
 */
export async function pollPendingEmbeddings(
  limit = 50
): Promise<QuestionEmbedding[]> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("embeddingStatus", ["pending", "failed"]),
    Query.limit(limit),
  ]);

  return res.documents.map(deserialize);
}

/**
 * Sweeps all embeddings from an old model version to stale.
 * Called during model upgrade — does NOT delete old vectors (zero downtime).
 */
export async function markModelStale(oldModel: string): Promise<number> {
  let cursor: string | undefined;
  let total = 0;

  do {
    const queries = [
      Query.equal("embeddingModel", oldModel),
      Query.equal("embeddingStatus", "complete"),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments(DB, COL, queries);
    if (res.documents.length === 0) break;

    await Promise.all(
      res.documents.map((doc) =>
        databases.updateDocument(DB, COL, doc.$id, {
          embeddingStatus: "stale" satisfies EmbeddingStatus,
        })
      )
    );

    total += res.documents.length;
    cursor = res.documents[res.documents.length - 1].$id;
  } while (true);

  return total;
}

/**
 * Content drift check: returns true when the question's current content hash
 * differs from the stored hash, meaning re-embedding is required.
 */
export async function isContentDrifted(
  questionId: string,
  currentHash: string
): Promise<boolean> {
  const record = await getByQuestionId(questionId);
  if (!record) return false;
  return record.contentHash !== currentHash;
}

// ─── Serialization ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserialize(doc: any): QuestionEmbedding {
  return {
    $id: doc.$id,
    questionId: doc.questionId,
    embeddingVector:
      typeof doc.embeddingVector === "string"
        ? JSON.parse(doc.embeddingVector)
        : doc.embeddingVector,
    embeddingInput: doc.embeddingInput,
    embeddingModel: doc.embeddingModel,
    embeddingVersion: doc.embeddingVersion,
    embeddingStatus: doc.embeddingStatus,
    lastEmbeddedAt: doc.lastEmbeddedAt ?? null,
    contentHash: doc.contentHash,
    dimensions: doc.dimensions,
  };
}
