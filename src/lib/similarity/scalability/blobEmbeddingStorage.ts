import { storage } from "@/models/server/config";
import { InputFile } from "node-appwrite";

const BUCKET_ID = process.env.APPWRITE_BUCKET_EMBEDDINGS || "embeddings";

/**
 * Step 7.6 — Blob embedding storage for tier3 (10M questions).
 * At 10M × 1536 × 4 bytes ≈ 60GB — too large for a single Appwrite collection.
 * Each embedding stored as a binary Float32Array file, keyed by questionId.
 * The question_embeddings collection stores metadata + a storageFileId reference.
 *
 * Not activated at tier1/tier2 — embeddingRepository reads vectors directly
 * from the collection document. At tier3, embeddingRepository reads the fileId
 * and delegates to this module.
 */

export async function writeEmbeddingBlob(
  questionId: string,
  vector: number[]
): Promise<string> {
  const float32 = new Float32Array(vector);
  const buffer = Buffer.from(float32.buffer);

  const file = await storage.createFile(
    BUCKET_ID,
    questionId,             // fileId = questionId — idempotent overwrites
    InputFile.fromBuffer(buffer, `${questionId}.f32`),
  );

  return file.$id;
}

export async function readEmbeddingBlob(
  questionId: string
): Promise<number[] | null> {
  try {
    const buffer = await storage.getFileDownload(BUCKET_ID, questionId);
    const float32 = new Float32Array(buffer);
    return Array.from(float32);
  } catch {
    return null;
  }
}

export async function deleteEmbeddingBlob(questionId: string): Promise<void> {
  try {
    await storage.deleteFile(BUCKET_ID, questionId);
  } catch {
    // File may not exist if embedding never completed — not an error
  }
}
