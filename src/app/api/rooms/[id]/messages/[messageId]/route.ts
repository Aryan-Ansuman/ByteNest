import { NextRequest, NextResponse } from "next/server";
import { databases } from "@/models/server/config";
import { db, roomMessagesCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string; messageId: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();

        const message = await databases.getDocument(
            db,
            roomMessagesCollection,
            params.messageId
        );

        return NextResponse.json({ message });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Message not found" },
            { status: 404 }
        );
    }
}
