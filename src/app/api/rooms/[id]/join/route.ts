import { NextRequest, NextResponse } from "next/server";
import { Query, ID } from "node-appwrite";
import { databases, users } from "@/models/server/config";
import {
    db,
    discussionRoomsCollection,
    roomMembersCollection,
    roomMessagesCollection,
} from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getAvatarColor } from "@/lib/getAvatarColor";
import { countActiveRoomMembers, syncRoomMemberCount } from "@/lib/rooms/server";

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;
        const { token } = await req.json().catch(() => ({}));

        // 1. Fetch room
        let room;
        try {
            room = await databases.getDocument(db, discussionRoomsCollection, roomId);
        } catch {
            return NextResponse.json({ error: "Room not found" }, { status: 404 });
        }

        // 2. Validate room state
        if (room.status === "archived") {
            return NextResponse.json({ error: "Room is archived" }, { status: 410 });
        }

        if (room.visibility === "private" && room.inviteToken !== token) {
            return NextResponse.json({ error: "Invalid invite token" }, { status: 403 });
        }

        // 3. Check for existing membership (rejoin path)
        const existing = await databases.listDocuments(
            db,
            roomMembersCollection,
            [
                Query.equal("roomId", roomId),
                Query.equal("userId", userId),
                Query.limit(1),
            ]
        );

        if (existing.total > 0) {
            // Rejoin — just update status and lastSeenAt
            const memberDoc = existing.documents[0];
            const updated = await databases.updateDocument(
                db,
                roomMembersCollection,
                memberDoc.$id,
                {
                    status: memberDoc.status === "muted" ? "muted" : "online",
                    lastSeenAt: new Date().toISOString(),
                }
            );
            await syncRoomMemberCount(roomId).catch(() => {});
            return NextResponse.json({ member: updated, rejoined: true });
        }

        const activeCount = await countActiveRoomMembers(roomId);
        if (activeCount >= room.maxMembers) {
            if (room.memberCount !== activeCount) {
                databases.updateDocument(db, discussionRoomsCollection, roomId, {
                    memberCount: activeCount,
                }).catch(() => {});
            }
            return NextResponse.json({ error: "Room is full" }, { status: 403 });
        }

        // 4. Fresh join
        const user = await users.get(userId);
        const now = new Date().toISOString();
        const avatarColor = getAvatarColor(userId);
        const displayName = user.name || "Anonymous";

        const member = await databases.createDocument(
            db,
            roomMembersCollection,
            ID.unique(),
            {
                roomId,
                userId,
                displayName,
                avatarColor,
                role: "member",
                status: "online",
                joinedAt: now,
                lastSeenAt: now,
            }
        );

        const reconciledCount = await countActiveRoomMembers(roomId);
        if (reconciledCount > room.maxMembers) {
            const allowed = await databases.listDocuments(
                db,
                roomMembersCollection,
                [
                    Query.equal("roomId", roomId),
                    Query.notEqual("status", "offline"),
                    Query.orderAsc("joinedAt"),
                    Query.limit(room.maxMembers),
                ]
            );
            const currentUserAllowed = allowed.documents.some(
                (doc) => doc.$id === member.$id
            );

            if (!currentUserAllowed) {
                await databases.deleteDocument(db, roomMembersCollection, member.$id);
                await syncRoomMemberCount(roomId).catch(() => {});
                return NextResponse.json({ error: "Room is full" }, { status: 403 });
            }
        }

        const finalCount = await syncRoomMemberCount(roomId);

        await Promise.all([
            databases.createDocument(db, roomMessagesCollection, ID.unique(), {
                roomId,
                authorId: userId,
                authorName: displayName,
                authorColor: avatarColor,
                body: `${displayName} joined the room`,
                type: "system",
                reactions: JSON.stringify({}),
            }),
            databases.updateDocument(db, discussionRoomsCollection, roomId, {
                memberCount: finalCount,
                lastActivityAt: now,
            }),
        ]);

        return NextResponse.json({ member, rejoined: false });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error joining room" },
            { status: error?.status || 500 }
        );
    }
}
