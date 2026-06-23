import { Client, Databases, Query } from 'node-appwrite';
import { logisticRegressionWeights, findF1Threshold } from './calibration.js';

const COLD_START_MIN = 100;
const CHANGE_THRESHOLD = 0.10; // 10% — ignore noise

export default async ({ req, res, log }) => {
  const client = new Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const db = new Databases(client);
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Load feedback from last 4 weeks
  const feedbackDocs = await db.listDocuments(
    process.env.APPWRITE_DATABASE_ID,
    process.env.APPWRITE_COLLECTION_DUPLICATE_FEEDBACK,
    [Query.greaterThan('createdAt', fourWeeksAgo), Query.limit(5000)]
  );

  const all = feedbackDocs.documents;

  // 2. Classify as positive / negative using signal weights
  const positiveActions = new Set(['clicked_did_not_post', 'clicked_abandoned']);
  const negativeActions = new Set(['explicitly_rejected']);
  const moderatorAction = 'moderator_confirmed';

  const positives = all.filter(d =>
    d.action === moderatorAction || positiveActions.has(d.action)
  );
  const negatives = all.filter(d => negativeActions.has(d.action));

  log(`Positives: ${positives.length}, Negatives: ${negatives.length}`);

  // 3. Cold-start guard
  if (positives.length + negatives.length < COLD_START_MIN) {
    log('Not enough signals for recalibration. Skipping.');
    return res.json({ status: 'skipped', reason: 'cold_start' });
  }

  // 4. Load current weights
  const weightDocs = await db.listDocuments(
    process.env.APPWRITE_DATABASE_ID,
    process.env.APPWRITE_COLLECTION_SCORING_WEIGHTS,
    [Query.orderDesc('version'), Query.limit(1)]
  );
  const current = weightDocs.documents[0];

  if (!current) {
    log('No initialized weights found. Aborting.');
    return res.json({ status: 'error', reason: 'no_weights' });
  }

  // 5. Logistic regression via gradient descent
  const newWeights = logisticRegressionWeights(positives, negatives, current);

  // 6. Check if change is significant
  const maxDelta = Math.max(
    Math.abs(newWeights.wSemantic  - current.wSemantic)  / current.wSemantic,
    Math.abs(newWeights.wIntent    - current.wIntent)    / current.wIntent,
    Math.abs(newWeights.wTag       - current.wTag)       / current.wTag,
    Math.abs(newWeights.wCommunity - current.wCommunity) / current.wCommunity,
  );

  if (maxDelta < CHANGE_THRESHOLD) {
    log(`Max delta ${maxDelta.toFixed(4)} below threshold. No update.`);
    return res.json({ status: 'no_change', maxDelta });
  }

  // 7. Recalibrate threshold (F1-maximizing)
  const newThreshold = findF1Threshold(positives, negatives, newWeights);

  // 8. Commit new weights
  await db.createDocument(
    process.env.APPWRITE_DATABASE_ID,
    process.env.APPWRITE_COLLECTION_SCORING_WEIGHTS,
    'unique()',
    {
      version:     current.version + 1,
      wSemantic:   newWeights.wSemantic,
      wIntent:     newWeights.wIntent,
      wTag:        newWeights.wTag,
      wCommunity:  newWeights.wCommunity,
      threshold:   newThreshold,
      activatedAt: new Date().toISOString(),
      source:      'recalibrated',
    }
  );

  log(`Recalibrated. New threshold: ${newThreshold.toFixed(3)}, maxDelta: ${maxDelta.toFixed(4)}`);
  return res.json({ status: 'updated', newWeights, newThreshold, maxDelta });
};
