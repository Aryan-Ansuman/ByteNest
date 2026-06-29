import { NextRequest, NextResponse } from "next/server";
import { databases } from "@/models/server/config";
import { db, discussionRoomsCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;
        const body = await req.json();

        // Verify requester is the host
        const room = await databases.getDocument(db, discussionRoomsCollection, roomId);

        if (room.hostId !== userId) {
            return NextResponse.json({ error: "Forbidden — only the host can update room settings" }, { status: 403 });
        }

        const updateData: Record<string, any> = {};

        if (body.visibility) {
            updateData.visibility = body.visibility;
        }

        if (body.maxMembers !== undefined) {
            const max = parseInt(body.maxMembers, 10);
            if (isNaN(max) || max < 2 || max > 50) {
                return NextResponse.json({ error: "Invalid capacity. Must be between 2 and 50." }, { status: 400 });
            }
            updateData.maxMembers = max;
        }

        if (Object.keys(updateData).length > 0) {
            await databases.updateDocument(db, discussionRoomsCollection, roomId, updateData);
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error updating room" },
            { status: error?.status || 500 }
        );
    }
}
