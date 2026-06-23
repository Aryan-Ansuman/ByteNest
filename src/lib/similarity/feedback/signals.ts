export const SIGNAL_WEIGHTS: Record<string, number> = {
  moderator_confirmed:        1.0,
  clicked_did_not_post:       0.8,
  clicked_abandoned:          0.7,
  clicked_posted_anyway:      0.2,
  explicitly_rejected:       -0.5,
  ignored_posted_anyway:     -0.2,
};

// Map frontend `action` enum → signal weight
export function getSignalWeight(action: string, confirmedByModerator = false): number {
  if (confirmedByModerator) return SIGNAL_WEIGHTS.moderator_confirmed;
  return SIGNAL_WEIGHTS[action] ?? 0;
}
