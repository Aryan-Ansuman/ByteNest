import { Client, Databases, Query } from 'node-appwrite';
import { handleEmbeddingFailure } from '../../embedding-job/src/failure-handler.js';

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

const databases = new Databases(client);

// Mock implementation of callEmbeddingAPI for OpenAI text-embedding-3-small
async function callEmbeddingAPI(input, modelName) {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      input,
      model: modelName,
      dimensions: 1536
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding API failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

export default async ({ req, res, log }) => {
  const configDoc = await databases.getDocument(
    APPWRITE_DATABASE_ID,
    'system_config',
    'embedding_model'
  );
  
  const activeModel = {
    name: configDoc.modelName,
    version: configDoc.modelVersion,
    dimensions: configDoc.dimensions,
  };

  // Priority: recently active questions first (recently edited or answered)
  const stale = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    'question_embeddings',
    [
      Query.equal('embeddingStatus', 'stale'),
      Query.orderDesc('lastEmbeddedAt'),  // most recently active first
      Query.limit(100),
    ]
  );

  if (stale.total === 0) {
    log('No stale embeddings. Re-embedding complete.');
    return res.json({ status: 'complete' });
  }

  log(`Processing ${stale.documents.length} stale embeddings...`);

  const results = { success: 0, failed: 0 };

  for (const doc of stale.documents) {
    try {
      const vector = await callEmbeddingAPI(doc.embeddingInput, activeModel.name);

      await databases.updateDocument(
        APPWRITE_DATABASE_ID,
        'question_embeddings',
        doc.$id,
        {
          embeddingVector:  JSON.stringify(vector),
          embeddingModel:   activeModel.name,
          embeddingVersion: activeModel.version,
          embeddingStatus:  'complete',
          dimensions:       activeModel.dimensions,
          lastEmbeddedAt:   new Date().toISOString(),
          // Old vector is now replaced — safe to overwrite
        }
      );

      results.success++;
    } catch (err) {
      log(`Failed re-embedding ${doc.questionId}: ${err.message}`);
      await handleEmbeddingFailure(doc, err, log, { json: () => {} }, databases, () => {});
      results.failed++;
    }
  }

  log(`Batch done. Success: ${results.success}, Failed: ${results.failed}`);
  return res.json({ status: 'batch_complete', ...results, remaining: stale.total - stale.documents.length });
};
