/**
 * The duplicate_feedback collection stores one row per suggestion interaction.
 * Aggregate into sessions (one object per sessionId) before computing metrics.
 */
export function aggregateFeedbackIntoSessions(feedbackRows) {
  const sessionMap = new Map();

  for (const row of feedbackRows) {
    if (!sessionMap.has(row.sessionId)) {
      sessionMap.set(row.sessionId, {
        sessionId:       row.sessionId,
        suggestionsShown: 0,
        actions:         [],
        experiments:     new Set(),
        rows:            [],
      });
    }

    const session = sessionMap.get(row.sessionId);
    session.suggestionsShown = Math.max(session.suggestionsShown, row.rank ?? 0);
    session.actions.push(row.action);
    session.rows.push(row);

    if (row.scoringExperiment) session.experiments.add(row.scoringExperiment);
  }

  return Array.from(sessionMap.values());
}
