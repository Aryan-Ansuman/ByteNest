import { NextRequest, NextResponse } from "next/server";
import { databases } from "@/models/server/config";
import { db, discussionRoomsCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
    countActiveRoomMembers,
    countRoomMessages,
    requireRoomMember,
} from "@/lib/rooms/server";

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        await requireRoomMember(params.id, userId);

        const room = await databases.getDocument(
            db,
            discussionRoomsCollection,
            params.id
        );

        const [memberCount, messageCount] = await Promise.all([
            countActiveRoomMembers(params.id),
            countRoomMessages(params.id),
        ]);

        if (room.memberCount !== memberCount) {
            databases.updateDocument(db, discussionRoomsCollection, params.id, {
                memberCount,
            }).catch(() => {});
        }

        return NextResponse.json({
            room: { ...room, memberCount, messageCount },
            messageCount,
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Room not found" },
            { status: 404 }
        );
    }
}
