import {
  computeDuplicatePreventionRate,
  computePrecisionAt3,
  computeFalsePositiveRate,
  computeSuggestionCTR,
  computePostingAbandonmentRate,
} from './compute-metrics.js';

export function computeExperimentBreakdowns(sessions, feedbackRows) {
  const experimentIds = new Set();
  for (const s of sessions) {
    for (const exp of s.experiments) experimentIds.add(exp);
  }

  const breakdowns = {};

  for (const experimentId of experimentIds) {
    const expSessions = sessions.filter(s => s.experiments.has(experimentId));
    const expRows     = feedbackRows.filter(r => r.scoringExperiment === experimentId);

    breakdowns[experimentId] = {
      sessionCount:          expSessions.length,
      duplicatePreventionRate: computeDuplicatePreventionRate(expSessions).value,
      precisionAt3:          computePrecisionAt3(expRows).value,
      falsePositiveRate:     computeFalsePositiveRate(expRows).value,
      suggestionCTR:         computeSuggestionCTR(expSessions).value,
      postingAbandonmentRate: computePostingAbandonmentRate(expSessions).value,
    };
  }

  return breakdowns;
}
