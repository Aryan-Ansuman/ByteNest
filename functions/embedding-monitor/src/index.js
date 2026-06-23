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

async function sendAlert({ subject, body }) {
  // Stubbed alert sender
  console.error(`ALERT: ${subject}\n${body}`);
}

export default async ({ req, res, log }) => {
  const [permanentlyFailed, stale, failed] = await Promise.all([
    databases.listDocuments(APPWRITE_DATABASE_ID, 'question_embeddings', [
      Query.equal('embeddingStatus', 'permanently_failed'), Query.limit(1),
    ]),
    databases.listDocuments(APPWRITE_DATABASE_ID, 'question_embeddings', [
      Query.equal('embeddingStatus', 'stale'), Query.limit(1),
    ]),
    databases.listDocuments(APPWRITE_DATABASE_ID, 'question_embeddings', [
      Query.equal('embeddingStatus', 'failed'), Query.limit(1),
    ]),
  ]);

  const report = {
    date:               new Date().toISOString(),
    permanentlyFailed:  permanentlyFailed.total,
    stale:              stale.total,
    awaitingRetry:      failed.total,
    alertRequired:      permanentlyFailed.total > 0,
  };

  log(JSON.stringify(report));

  if (report.alertRequired) {
    await sendAlert({
      subject: `[ByteNest] ${permanentlyFailed.total} embeddings permanently failed`,
      body:    `Check question_embeddings where status = permanently_failed.\nRun the recovery job or investigate the embedding API.`,
    });
  }

  return res.json(report);
};
