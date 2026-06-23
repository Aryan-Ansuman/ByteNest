/**
 * Compute all five metrics from a week's feedback documents.
 * Each function takes the full array and extracts what it needs.
 */

export function computeDuplicatePreventionRate(sessions) {
  const withSuggestions = sessions.filter(s => s.suggestionsShown > 0);
  if (withSuggestions.length === 0) return { value: 0, raw: {} };

  const didNotPost = withSuggestions.filter(s =>
    s.actions.some(a => ['clicked_did_not_post', 'abandoned', 'clicked_abandoned'].includes(a))
    && !s.actions.includes('posted')
  );

  return {
    value: didNotPost.length / withSuggestions.length,
    raw: {
      totalSessionsWithSuggestions: withSuggestions.length,
      sessionsWithNoPost: didNotPost.length,
    },
  };
}

export function computePrecisionAt3(feedbackRows) {
  const shown     = feedbackRows.filter(r => r.rank >= 1 && r.rank <= 3);
  const confirmed = shown.filter(r =>
    ['clicked_did_not_post', 'clicked_abandoned', 'moderator_confirmed'].includes(r.action)
  );

  if (shown.length === 0) return { value: 0, raw: {} };

  return {
    value: confirmed.length / shown.length,
    raw: {
      totalSuggestionsShown: shown.length,
      confirmedDuplicates:   confirmed.length,
    },
  };
}

export function computeFalsePositiveRate(feedbackRows) {
  const shown    = feedbackRows.filter(r => r.rank >= 1 && r.rank <= 3);
  const rejected = shown.filter(r => r.action === 'explicitly_rejected' || r.action === 'reported_not_duplicate');

  if (shown.length === 0) return { value: 0, raw: {} };

  return {
    value: rejected.length / shown.length,
    raw: {
      totalSuggestionsShown: shown.length,
      explicitRejections:    rejected.length,
    },
  };
}

export function computeSuggestionCTR(sessions) {
  const withSuggestions = sessions.filter(s => s.suggestionsShown > 0);
  if (withSuggestions.length === 0) return { value: 0, raw: {} };

  const withClick = withSuggestions.filter(s =>
    s.actions.some(a => a.startsWith('clicked'))
  );

  return {
    value: withClick.length / withSuggestions.length,
    raw: {
      totalSessionsWithSuggestions: withSuggestions.length,
      sessionsWithClick:            withClick.length,
    },
  };
}

export function computePostingAbandonmentRate(sessions) {
  const withClick = sessions.filter(s =>
    s.suggestionsShown > 0 &&
    s.actions.some(a => a.startsWith('clicked'))
  );

  if (withClick.length === 0) return { value: 0, raw: {} };

  const abandoned = withClick.filter(s =>
    (s.actions.includes('abandoned') || s.actions.includes('clicked_abandoned')) && !s.actions.includes('posted')
  );

  return {
    value: abandoned.length / withClick.length,
    raw: {
      sessionsWithClick:          withClick.length,
      sessionsClickedThenAbandoned: abandoned.length,
    },
  };
}
