import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, codeSessionsCollection, roomMembersCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;

        // Verify membership
        const memberQuery = await databases.listDocuments(db, roomMembersCollection, [
            Query.equal("roomId", roomId),
            Query.equal("userId", userId),
            Query.limit(1),
        ]);
        if (memberQuery.total === 0) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        const result = await databases.listDocuments(db, codeSessionsCollection, [
            Query.equal("roomId", roomId),
            Query.orderDesc("$createdAt"),
            Query.limit(20),
        ]);

        return NextResponse.json({ sessions: result.documents });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json({ error: error?.message || "Error" }, { status: 500 });
    }
}
