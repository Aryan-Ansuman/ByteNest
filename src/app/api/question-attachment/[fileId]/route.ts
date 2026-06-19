import { questionAttachmentBucket } from "@/models/name";
import { storage } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
    _request: NextRequest,
    { params }: { params: { fileId: string } }
) {
    const fileId = params.fileId;
    if (!fileId) {
        return NextResponse.json({ error: "fileId is required" }, { status: 400 });
    }

    const [file, preview] = await Promise.all([
        storage.getFile(questionAttachmentBucket, fileId),
        storage.getFilePreview(questionAttachmentBucket, fileId, 1400, 1000, undefined, 82),
    ]);

    return new NextResponse(preview, {
        status: 200,
        headers: {
            "Content-Type": file.mimeType || "image/jpeg",
            "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
        },
    });
}
