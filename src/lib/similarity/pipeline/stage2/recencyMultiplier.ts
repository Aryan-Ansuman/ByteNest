/**
 * Step 6.13 — Recency multiplier.
 * Not a hard cutoff — smoothly reduces score of older content.
 * Applied after the hybrid score is computed.
 *
 * < 1 year old:                          1.0
 * 1–2 years old:                         0.9
 * > 2 years old, has accepted answer:    0.8
 * > 2 years old, no accepted answer:     0.6
 */

const ONE_YEAR_MS  = 365 * 24 * 60 * 60 * 1000;
const TWO_YEARS_MS = 2 * ONE_YEAR_MS;

export function getRecencyMultiplier(
  createdAt: string,
  hasAcceptedAnswer: boolean
): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();

  if (ageMs < ONE_YEAR_MS)  return 1.0;
  if (ageMs < TWO_YEARS_MS) return 0.9;
  return hasAcceptedAnswer ? 0.8 : 0.6;
}
