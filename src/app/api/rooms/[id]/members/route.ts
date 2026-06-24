import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, roomMembersCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();

        const result = await databases.listDocuments(
            db,
            roomMembersCollection,
            [
                Query.equal("roomId", params.id),
                Query.notEqual("status", "offline"),
                Query.orderAsc("joinedAt"),
                Query.limit(100),
            ]
        );

        return NextResponse.json({ members: result.documents });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error fetching members" },
            { status: error?.status || 500 }
        );
    }
}
