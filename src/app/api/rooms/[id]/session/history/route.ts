import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import {
    db,
    codeSessionsCollection,
    roomMembersCollection,
} from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

// ─── GET /api/rooms/[id]/session/history ───────────────────────────────────
// Lists past (ended) code sessions for a room, most recent first. Used by
// the diff view to let a member pick a previous snapshot to compare the
// live file against. Snapshots can be large, so this list intentionally
// omits `yjsSnapshotB64` — callers fetch the full session via
// GET /api/rooms/[id]/session/[sessionId] once a specific one is chosen.
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;

        const member = await databases.listDocuments(db, roomMembersCollection, [
            Query.equal("roomId", roomId),
            Query.equal("userId", userId),
            Query.limit(1),
        ]);
        if (member.total === 0) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 50);

        const result = await databases.listDocuments(db, codeSessionsCollection, [
            Query.equal("roomId", roomId),
            Query.equal("status", "ended"),
            Query.orderDesc("endedAt"),
            Query.limit(limit),
            // Exclude the (potentially huge) snapshot field from the list response
            Query.select(["$id", "$createdAt", "roomId", "hostId", "status", "files", "activeFile", "endedAt"]),
        ]);

        return NextResponse.json({ sessions: result.documents });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Failed to fetch session history" },
            { status: 500 }
        );
    }
}
