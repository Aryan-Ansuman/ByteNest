import { Client, Databases, Query } from 'node-appwrite';

const APPWRITE_ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1';
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;

const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID)
    .setKey(APPWRITE_API_KEY);

const databases = new Databases(client);

// Minimal enqueueEvent implementation
async function enqueueEvent(eventType, payload) {
  // In a real setup, this inserts into event_queue collection
  return true;
}

export default async ({ req, res, log }) => {
  if (!req.body) return res.json({ status: 'ignored' });
  const { newModelName, newModelVersion, newDimensions } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

  const configDoc = await databases.getDocument(
    APPWRITE_DATABASE_ID,
    'system_config',
    'embedding_model'
  );
  const oldModelName = configDoc.modelName;

  log(`Upgrading: ${oldModelName} → ${newModelName}`);

  // 1. Update active model config
  await databases.updateDocument(
    APPWRITE_DATABASE_ID,
    'system_config',
    'embedding_model',
    {
      modelName:    newModelName,
      modelVersion: newModelVersion,
      dimensions:   newDimensions,
      updatedAt:    new Date().toISOString(),
    }
  );

  // 2. Mark all embeddings on old model as stale — in batches
  let offset = 0;
  let marked = 0;

  while (true) {
    const batch = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'question_embeddings',
      [
        Query.equal('embeddingModel', oldModelName),
        Query.equal('embeddingStatus', 'complete'),
        Query.limit(100),
        Query.offset(offset),
      ]
    );

    if (batch.total === 0 || batch.documents.length === 0) break;

    // Update each document in the batch
    await Promise.all(
      batch.documents.map(doc =>
        databases.updateDocument(
          APPWRITE_DATABASE_ID,
          'question_embeddings',
          doc.$id,
          { embeddingStatus: 'stale' }
          // Old vector stays — used for search until new one is ready
        )
      )
    );

    marked += batch.documents.length;
    offset += 100;
    log(`Marked stale: ${marked} so far...`);

    if (batch.documents.length < 100) break;
  }

  // 3. Start re-embedding background job
  await enqueueEvent('StaleReembeddingStarted', {
    oldModel: oldModelName,
    newModel: newModelName,
    totalMarked: marked,
  });

  log(`Model upgrade complete. Marked ${marked} embeddings stale.`);
  return res.json({ status: 'upgrade_initiated', marked });
};
