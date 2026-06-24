import { NextRequest, NextResponse } from "next/server";
import { Query, ID } from "node-appwrite";
import { databases } from "@/models/server/config";
import {
    db,
    discussionRoomsCollection,
    roomMembersCollection,
    roomMessagesCollection,
    codeSessionsCollection,
} from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

type Action = "kick" | "mute" | "unmute" | "transfer" | "slow_mode" | "view_only";

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;
        const body = await req.json();
        const { action, targetUserId, slowMode, viewOnly } = body as {
            action: Action;
            targetUserId?: string;
            slowMode?: string;
            viewOnly?: boolean;
        };

        // Verify requester is the host
        const room = await databases.getDocument(db, discussionRoomsCollection, roomId);

        if (room.hostId !== userId) {
            return NextResponse.json({ error: "Forbidden — only the host can moderate" }, { status: 403 });
        }

        // Helper: find member doc by userId
        const findMember = async (uid: string) => {
            const q = await databases.listDocuments(
                db,
                roomMembersCollection,
                [
                    Query.equal("roomId", roomId),
                    Query.equal("userId", uid),
                    Query.limit(1),
                ]
            );
            return q.documents[0] ?? null;
        };

        switch (action) {
            case "kick": {
                if (!targetUserId) return NextResponse.json({ error: "No target" }, { status: 400 });
                const target = await findMember(targetUserId);
                if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

                await Promise.all([
                    databases.deleteDocument(db, roomMembersCollection, target.$id),
                    databases.updateDocument(db, discussionRoomsCollection, roomId, {
                        memberCount: Math.max(0, room.memberCount - 1),
                    }),
                    databases.createDocument(db, roomMessagesCollection, ID.unique(), {
                        roomId,
                        authorId: "system",
                        authorName: "System",
                        authorColor: "indigo",
                        body: `${target.displayName} was removed from the room`,
                        type: "system",
                        reactions: JSON.stringify({}),
                    }),
                ]);
                return NextResponse.json({ ok: true });
            }

            case "mute": {
                if (!targetUserId) return NextResponse.json({ error: "No target" }, { status: 400 });
                const target = await findMember(targetUserId);
                if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

                await databases.updateDocument(db, roomMembersCollection, target.$id, {
                    status: "muted",
                });
                return NextResponse.json({ ok: true });
            }

            case "unmute": {
                if (!targetUserId) return NextResponse.json({ error: "No target" }, { status: 400 });
                const target = await findMember(targetUserId);
                if (!target) return NextResponse.json({ error: "Member not found" }, { status: 404 });

                await databases.updateDocument(db, roomMembersCollection, target.$id, {
                    status: "online",
                });
                return NextResponse.json({ ok: true });
            }

            case "transfer": {
                if (!targetUserId) return NextResponse.json({ error: "No target" }, { status: 400 });
                const [currentHost, newHost] = await Promise.all([
                    findMember(userId),
                    findMember(targetUserId),
                ]);
                if (!currentHost || !newHost) {
                    return NextResponse.json({ error: "Member not found" }, { status: 404 });
                }

                await Promise.all([
                    databases.updateDocument(db, roomMembersCollection, currentHost.$id, {
                        role: "member",
                    }),
                    databases.updateDocument(db, roomMembersCollection, newHost.$id, {
                        role: "host",
                    }),
                    databases.updateDocument(db, discussionRoomsCollection, roomId, {
                        hostId: targetUserId,
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
                return NextResponse.json({ ok: true });
            }

            case "slow_mode": {
                await databases.updateDocument(db, discussionRoomsCollection, roomId, {
                    slowMode: slowMode ?? "off",
                });
                return NextResponse.json({ ok: true });
            }

            case "view_only": {
                if (room.activeCodeSessionId) {
                    await databases.updateDocument(
                        db,
                        codeSessionsCollection,
                        room.activeCodeSessionId,
                        { viewOnly: viewOnly ?? false }
                    );
                }
                return NextResponse.json({ ok: true });
            }

            default:
                return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        }
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error moderating room" },
            { status: error?.status || 500 }
        );
    }
}
