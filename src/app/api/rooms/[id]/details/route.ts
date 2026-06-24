import { NextRequest, NextResponse } from "next/server";
import { databases } from "@/models/server/config";
import { db, discussionRoomsCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();

        const room = await databases.getDocument(
            db,
            discussionRoomsCollection,
            params.id
        );

        return NextResponse.json({ room });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Room not found" },
            { status: 404 }
        );
    }
}
