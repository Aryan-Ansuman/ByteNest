import { Client, Databases, Query } from 'node-appwrite';
import { handleEmbeddingFailure } from './failure-handler.js';

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

// Minimal enqueueEvent implementation
async function enqueueEvent(eventType, payload) {
  // In a real setup, this inserts into event_queue collection
  // For now, we simulate success
  return true;
}

export default async ({ req, res, log }) => {
  if (!req.body) return res.json({ status: 'ignored' });
  const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  
  // Appwrite triggered events have a custom payload structure, or standard
  // Assuming standard { questionId } passed either via event or direct API call
  const questionId = payload.questionId || (payload.eventData && payload.eventData.questionId);

  if (!questionId) {
    return res.json({ status: 'ignored', reason: 'no_questionId' });
  }

  // Load the pending/failed record
  const docs = await databases.listDocuments(
    APPWRITE_DATABASE_ID,
    'question_embeddings',
    [Query.equal('questionId', questionId), Query.limit(1)]
  );

  if (docs.total === 0) {
    log(`No embedding record for ${questionId}`);
    return res.json({ status: 'not_found' });
  }

  const doc = docs.documents[0];

  // Guard: skip if already complete or permanently failed
  if (['complete', 'permanently_failed'].includes(doc.embeddingStatus)) {
    return res.json({ status: 'skipped', reason: doc.embeddingStatus });
  }

  // Mark as generating
  await databases.updateDocument(
    APPWRITE_DATABASE_ID,
    'question_embeddings',
    doc.$id,
    { embeddingStatus: 'generating' }
  );

  try {
    const vector = await callEmbeddingAPI(doc.embeddingInput, doc.embeddingModel);

    await databases.updateDocument(
      APPWRITE_DATABASE_ID,
      'question_embeddings',
      doc.$id,
      {
        embeddingVector:  JSON.stringify(vector),
        embeddingStatus:  'complete',
        lastEmbeddedAt:   new Date().toISOString(),
        retryCount:       0,
        failureReason:    null,
        nextRetryAt:      null,
      }
    );

    await enqueueEvent('EmbeddingGenerated', { questionId });
    return res.json({ status: 'complete', questionId });

  } catch (err) {
    return await handleEmbeddingFailure(doc, err, log, res, databases, enqueueEvent);
  }
};
