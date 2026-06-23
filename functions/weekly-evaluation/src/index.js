import { Client, Databases, Query, ID } from 'node-appwrite';
import { aggregateFeedbackIntoSessions } from './lib/evaluation/aggregate-sessions.js';
import {
  computeDuplicatePreventionRate,
  computePrecisionAt3,
  computeFalsePositiveRate,
  computeSuggestionCTR,
  computePostingAbandonmentRate,
} from './lib/evaluation/compute-metrics.js';
import { detectAlerts, buildTrailingStatsPayload } from './lib/evaluation/trailing-stats.js';
import { computeExperimentBreakdowns } from './lib/evaluation/experiment-breakdown.js';
import { sendAlert } from './lib/alerting.js';

export default async ({ req, res, log, error }) => {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1')
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);
  const DATABASE_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID;

  const now           = new Date();
  const weekStart     = getLastMonday(now);
  const weekEnd       = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fourWeeksAgo  = new Date(weekStart.getTime() - 28 * 24 * 60 * 60 * 1000);

  try {
    // 1. Load this week's feedback rows
    const feedbackDocs = await databases.listDocuments(
      DATABASE_ID,
      'duplicate_feedback',
      [
        Query.greaterThanEqual('createdAt', weekStart.toISOString()),
        Query.lessThanEqual('createdAt', weekEnd.toISOString()),
        Query.limit(10000),
      ]
    );

    const feedbackRows = feedbackDocs.documents;
    const sessions     = aggregateFeedbackIntoSessions(feedbackRows);

    log(`Sessions: ${sessions.length}, Feedback rows: ${feedbackRows.length}`);

    // 2. Compute the five metrics
    const dpr  = computeDuplicatePreventionRate(sessions);
    const p3   = computePrecisionAt3(feedbackRows);
    const fpr  = computeFalsePositiveRate(feedbackRows);
    const ctr  = computeSuggestionCTR(sessions);
    const par  = computePostingAbandonmentRate(sessions);

    const currentMetrics = {
      duplicatePreventionRate: dpr.value,
      precisionAt3:            p3.value,
      falsePositiveRate:       fpr.value,
      suggestionCTR:           ctr.value,
      postingAbandonmentRate:  par.value,
    };

    // 3. Load trailing four weeks of snapshots
    const trailingDocs = await databases.listDocuments(
      DATABASE_ID,
      'evaluation_snapshots',
      [
        Query.greaterThanEqual('weekStartDate', fourWeeksAgo.toISOString().split('T')[0]),
        Query.lessThan('weekStartDate', weekStart.toISOString().split('T')[0]),
        Query.orderDesc('weekStartDate'),
        Query.limit(4),
      ]
    );

    const trailingSnapshots  = trailingDocs.documents;
    const trailingStatsPayload = buildTrailingStatsPayload(trailingSnapshots);

    // 4. Detect alerts
    const alertReasons = detectAlerts(currentMetrics, trailingSnapshots);
    const alertFired   = alertReasons.length > 0;

    // 5. Compute experiment breakdowns (Step 13.3)
    const experimentBreakdowns = computeExperimentBreakdowns(sessions, feedbackRows);

    // 6. Write snapshot
    await databases.createDocument(
      DATABASE_ID,
      'evaluation_snapshots',
      ID.unique(),
      {
        weekStartDate: weekStart.toISOString().split('T')[0],
        weekEndDate:   weekEnd.toISOString().split('T')[0],

        // Five metrics
        ...currentMetrics,

        // Raw counts
        ...dpr.raw,
        ...p3.raw,
        ...fpr.raw,
        ...ctr.raw,
        ...par.raw,

        // Trailing stats
        ...trailingStatsPayload,

        // Alerts
        alertFired,
        alertReasons: JSON.stringify(alertReasons),

        // Experiment breakdowns
        experimentBreakdowns: JSON.stringify(experimentBreakdowns),

        createdAt: now.toISOString(),
      }
    );

    // 7. Fire alert if needed
    if (alertFired) {
      await sendAlert({
        subject: `[ByteNest] Evaluation alert — week of ${weekStart.toISOString().split('T')[0]}`,
        body: [
          `The following metrics deviated more than 2 standard deviations from their trailing average:`,
          '',
          ...alertReasons.map(r => `  • ${r}`),
          '',
          `Review the evaluation_snapshots collection for details.`,
        ].join('\n'),
      });
    }

    log(`Snapshot written. Alert fired: ${alertFired}`);
    return res.json({ status: 'complete', currentMetrics, alertFired, alertReasons });
  } catch (err) {
    error(`Evaluation failed: ${err.message}`);
    return res.json({ status: 'error', error: err.message }, 500);
  }
};

// ── helpers ──────────────────────────────────────────────────────────────────
function getLastMonday(date) {
  const d   = new Date(date);
  const day = d.getDay(); // 0 = Sunday, 1 = Monday ...
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
