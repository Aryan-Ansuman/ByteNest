import { NextResponse } from "next/server";
import { recordFeedback } from "@/lib/similarity/data/feedbackRepository";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // We expect the client to pass the required params:
    // sessionId, action, suggestedCandidateId, rank, sourceQuestionTitle, and optionally scores
    
    // Since 'scores' might not be provided for non-specific actions (e.g., 'suggestions_shown')
    // we default to 0 if not provided.
    const defaultScores = { semantic: 0, intent: 0, tag: 0, community: 0, hybrid: 0 };
    const scores = body.scores || defaultScores;

    await recordFeedback({
      sessionId: body.sessionId,
      action: body.action,
      suggestedCandidateId: body.suggestedCandidateId || "none",
      rank: body.rank || 0,
      sourceQuestionTitle: body.sourceQuestionTitle || "",
      timeToActionMs: 0, // In a real app we'd measure time between shown and clicked
      intentLabel: "",
      scores: {
        semantic: scores.semantic,
        intent: scores.intent ?? 0,
        tag: scores.tag,
        community: scores.community,
        hybrid: scores.hybrid,
      },
      explanationTokens: body.explanationTokens,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // If the duplicate_feedback collection hasn't been created by the setup script, ignore it
    if (err?.message?.includes("Collection") && err?.message?.includes("could not be found")) {
      console.warn('Feedback skipped: telemetry collection not initialized.');
      return NextResponse.json({ ok: true });
    }
    console.error('Feedback record error:', err);
    return NextResponse.json({ error: "Failed to record" }, { status: 500 });
  }
}
