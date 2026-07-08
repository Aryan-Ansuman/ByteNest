import { questionAttachmentBucket } from "@/models/name";
import { storage } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// ─── PR-Linked Q&A (Phase 5) ────────────────────────────────────────────────
// Serves the raw unified diff text stored in Appwrite Storage (Phase 1,
// Decision 1) so PrDiffViewer can fetch it client-side and hand it to
// react-diff-view's parseDiff. fileId is the question's own $id — see the
// naming convention in FetchPrDiffProcessor.ts (ID.custom(questionId)).
export async function GET(
    _request: NextRequest,
    { params }: { params: { fileId: string } }
) {
    const fileId = params.fileId;
    if (!fileId) {
        return NextResponse.json({ error: "fileId is required" }, { status: 400 });
    }

    try {
        const bytes = await storage.getFileView(questionAttachmentBucket, fileId);
        return new NextResponse(Buffer.from(bytes), {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                // Diffs are immutable snapshots per Phase 8 (a refresh writes a
                // NEW diffFetchedAt but overwrites this same fileId) — cache
                // briefly rather than not at all, but keep it short since a
                // refresh can legitimately change the content under this id.
                "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
            },
        });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Diff not found" },
            { status: error?.code === 404 ? 404 : 500 }
        );
    }
}
