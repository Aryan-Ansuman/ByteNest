import { NextResponse } from "next/server";
import { runRealtimePipeline } from "@/lib/similarity/pipelines/realtime";

export async function GET(req: Request) {
    try {
        const title = "Experiencing intermittent deadlock and memory growth in high-throughput async pipeline";
        
        const { assembleStage1Candidates } = await import("@/lib/similarity/pipeline/stage1/candidateAssembler");
        const stage1 = await assembleStage1Candidates({
            sourceTitle: title,
            sourceBody: "",
            sourceTags: [],
        });

        const { runStage2 } = await import("@/lib/similarity/pipeline/stage2/hybridScorer");
        const ranked = await runStage2({
            sourceVector: new Array(1536).fill(0.1),
            sourceTitle: title,
            sourceTags: [],
            candidates: stage1.candidates,
            intentContexts: new Map()
        });

        return NextResponse.json({ stage1, ranked });
    } catch (err: any) {
        return NextResponse.json({ error: err.message, stack: err.stack });
    }
}
