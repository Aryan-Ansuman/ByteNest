import { computeAnswerComplexity } from "../../nlp/answerComplexity";

const EXPERTISE_TOKENS = {
  LEVEL_MATCH:          "Matches your experience level.",
  BEGINNER_FRIENDLY:    "Beginner-friendly answer available.",
  ADVANCED_ANSWER:      "In-depth answer for experienced developers.",
};

export type ExpertiseContext = {
  userTier: string | null;
  expertisePenalty: number;
};

export function generateExplanationTokens(
  scores: { semantic: number; tagJaccard: number; intentMatch: boolean; intentConfidence: number },
  candidate: any,
  expertiseContext: ExpertiseContext | null = null
): string[] {
  const candidates: { token: string; priority: number }[] = [];

  // ── Existing tokens from Part 9 (unchanged) ──────────────────────────────
  if (scores.semantic > 0.8)
    candidates.push({ token: "Similar problem description.", priority: scores.semantic });

  if (scores.tagJaccard > 0.7)
    candidates.push({ token: "Same technology stack.", priority: scores.tagJaccard });

  if (scores.intentMatch && scores.intentConfidence > 0.7)
    candidates.push({ token: "Same question intent.", priority: scores.intentConfidence });

  if (candidate.hasAcceptedAnswer)
    candidates.push({ token: "Has a verified solution.", priority: 0.75 });

  const ageMs = Date.now() - new Date(candidate.createdAt).getTime();
  if (ageMs < 30 * 24 * 60 * 60 * 1000)
    candidates.push({ token: "Recently asked.", priority: 0.6 });

  if (candidate.acceptedAnswerAuthorIsExpert)
    candidates.push({ token: "Answered by a recognized expert.", priority: 0.65 });

  // ── Expertise tokens (only when context provided) ─────────────────────────
  if (expertiseContext) {
    const { userTier, expertisePenalty } = expertiseContext;

    if (userTier && expertisePenalty === 0 && candidate.hasAcceptedAnswer) {
      // Good match — answer complexity aligns with user tier
      candidates.push({ token: EXPERTISE_TOKENS.LEVEL_MATCH, priority: 0.70 });
    }

    if (userTier === 'newcomer' && candidate.acceptedAnswerBody) {
      const complexity = computeAnswerComplexity(candidate.acceptedAnswerBody);
      if (complexity < 0.35) {
        candidates.push({ token: EXPERTISE_TOKENS.BEGINNER_FRIENDLY, priority: 0.68 });
      }
    }

    if (['advanced', 'expert'].includes(userTier || '') && candidate.acceptedAnswerBody) {
      const complexity = computeAnswerComplexity(candidate.acceptedAnswerBody);
      if (complexity > 0.70) {
        candidates.push({ token: EXPERTISE_TOKENS.ADVANCED_ANSWER, priority: 0.68 });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  const selected = candidates.slice(0, 4).map(c => c.token);

  if (selected.length === 0) selected.push("Similar problem description.");
  if (selected.length === 1 && candidate.hasAcceptedAnswer)
    selected.push("Has a verified solution.");

  return selected;
}
