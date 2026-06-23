import { databases } from "@/models/server/config";
import { db as DB, duplicateFeedbackCollection as COL } from "@/models/name";
import { ID } from "node-appwrite";

export type FeedbackScores = {
  semantic: number;
  intent: number;
  tag: number;
  community: number;
  hybrid: number;
};

export type FeedbackParams = {
  sessionId: string;
  userId?: string | null;
  sourceQuestionTitle: string;
  suggestedCandidateId: string;
  rank: number;
  action: string;
  timeToActionMs: number;
  intentLabel: string;
  scores: FeedbackScores;
};

import { getActiveWeights } from "../feedback/getActiveWeights";

export async function recordFeedback({
  sessionId,
  userId,
  sourceQuestionTitle,
  suggestedCandidateId,
  rank,
  action,
  timeToActionMs,
  intentLabel,
  scores,           // { semantic, intent, tag, community, hybrid }
  explanationTokens,
}: FeedbackParams & { explanationTokens?: string[] }) {
  // Step 13.3: record which weight configuration was active for this session
  const activeWeights     = await getActiveWeights();
  const scoringExperiment = `weights_v${activeWeights.version || '1'}`;

  await databases.createDocument(
    DB,
    COL,
    ID.unique(),
    {
      sessionId,
      userId: userId ?? null,
      sourceQuestionTitle,
      suggestedCandidateId,
      rank,
      action,
      timeToActionMs,
      intentLabel,
      semanticScore:   scores.semantic,
      intentScore:     scores.intent,
      tagScore:        scores.tag,
      communityScore:  scores.community,
      hybridScore:     scores.hybrid,
      explanationTokens: JSON.stringify(explanationTokens ?? []),
      scoringExperiment,    // ← Step 13.3 field
      createdAt:       new Date().toISOString(),
    }
  );
}
