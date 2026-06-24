import { NextRequest, NextResponse } from "next/server";
import { Query, ID } from "node-appwrite";
import { databases } from "@/models/server/config";
import {
    db,
    discussionRoomsCollection,
    roomMembersCollection,
    roomMessagesCollection,
} from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;

        // 1. Find member document
        const existing = await databases.listDocuments(
            db,
            roomMembersCollection,
            [
                Query.equal("roomId", roomId),
                Query.equal("userId", userId),
                Query.limit(1),
            ]
        );

        if (existing.total === 0) {
            return NextResponse.json({ error: "Not a member" }, { status: 404 });
        }

        const memberDoc = existing.documents[0];
        const room = await databases.getDocument(db, discussionRoomsCollection, roomId);
        const isHost = memberDoc.role === "host";
        const newCount = Math.max(0, room.memberCount - 1);

        // 2. Delete member doc + decrement count
        await Promise.all([
            databases.deleteDocument(db, roomMembersCollection, memberDoc.$id),
            databases.updateDocument(db, discussionRoomsCollection, roomId, {
                memberCount: newCount,
            }),
        ]);

        // 3. Host transfer if needed
        if (isHost && newCount > 0) {
            const remaining = await databases.listDocuments(
                db,
                roomMembersCollection,
                [
                    Query.equal("roomId", roomId),
                    Query.orderAsc("joinedAt"),
                    Query.limit(1),
                ]
            );

            if (remaining.total > 0) {
                const newHost = remaining.documents[0];
                await Promise.all([
                    databases.updateDocument(db, roomMembersCollection, newHost.$id, {
                        role: "host",
                    }),
                    databases.updateDocument(db, discussionRoomsCollection, roomId, {
                        hostId: newHost.userId,
                    }),
                    databases.createDocument(db, roomMessagesCollection, ID.unique(), {
                        roomId,
                        authorId: "system",
                        authorName: "System",
                        authorColor: "indigo",
                        body: `${newHost.displayName} is now the host`,
                        type: "system",
                        reactions: JSON.stringify({}),
                    }),
                ]);
            }
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error leaving room" },
            { status: error?.status || 500 }
        );
    }
}
