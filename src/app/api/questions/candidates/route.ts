import { NextResponse } from "next/server";
import { runRealtimePipeline } from "@/lib/similarity/pipelines/realtime";
import type { ConsumerConfig } from "@/lib/similarity/types";

const REALTIME_CONSUMER: ConsumerConfig = {
  id: "realtime_ui",
  latencyBudgetMs: 800,
};

export async function POST(req: Request) {
  try {
    const { title, body, tags } = await req.json();

    // Re-validate thresholds server-side
    if (!title || title.length < 20) return NextResponse.json({ suggestions: [] });
    if ((title + (body ?? '')).length < 50) return NextResponse.json({ suggestions: [] });

    const result = await runRealtimePipeline({
      draftTitle: title,
      draftBody: body,
      draftTags: tags,
    }, REALTIME_CONSUMER);

    console.log("[API Candidates] Pipeline result candidates count:", result.candidates.length);

    // Return top 3 candidates (stage 2 already filters to top 3, but enforcing here)
    return NextResponse.json({ suggestions: result.candidates.slice(0, 3) });
  } catch (err) {
    console.error('Candidate pipeline error:', err);
    return NextResponse.json({ suggestions: [] }, { status: 500 });
  }
}
