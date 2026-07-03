import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, roomMessagesCollection, roomMembersCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

// ─── GET /api/rooms/[id]/activity — system event log (joins, kicks, sessions…) ───
// System events are already stored as room_messages with type="system" — this
// route just filters + paginates that same data so the UI can show a clean
// activity feed without re-deriving events from scratch.
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;
        const { searchParams } = new URL(req.url);
        const before = searchParams.get("before");
        const limit = 50;

        // Verify membership
        const memberQuery = await databases.listDocuments(db, roomMembersCollection, [
            Query.equal("roomId", roomId),
            Query.equal("userId", userId),
            Query.limit(1),
        ]);
        if (memberQuery.total === 0) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        const queries = [
            Query.equal("roomId", roomId),
            Query.equal("type", "system"),
            Query.orderDesc("$createdAt"),
            Query.limit(limit),
        ];
        if (before) queries.push(Query.lessThan("$createdAt", before));

        const result = await databases.listDocuments(db, roomMessagesCollection, queries);

        return NextResponse.json({
            events: result.documents,
            hasMore: result.total > limit,
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error fetching activity log" },
            { status: error?.status || 500 }
        );
    }
}
