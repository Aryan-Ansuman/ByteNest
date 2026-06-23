import { databases } from "@/models/server/config";
import { db, systemConfigCollection } from "@/models/name";

export type EmbeddingModelConfig = {
  name: string;
  version: number;
  dimensions: number;
};

export async function getActiveEmbeddingModel(): Promise<EmbeddingModelConfig> {
  try {
    const doc = await databases.getDocument(
      db,
      systemConfigCollection,
      'embedding_model'
    );
    return {
      name: doc.modelName,
      version: doc.modelVersion,
      dimensions: doc.dimensions,
    };
  } catch (err: any) {
    if (err.code === 404) {
      // Fallback in case it wasn't seeded yet
      return {
        name: 'text-embedding-3-small',
        version: 1,
        dimensions: 1536,
      };
    }
    throw err;
  }
}
