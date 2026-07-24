import { NextRequest, NextResponse } from "next/server";
import { Query, ID } from "node-appwrite";
import { databases } from "@/models/server/config";
import {
    db,
    discussionRoomsCollection,
    roomMembersCollection,
    roomMessagesCollection,
    codeSessionsCollection,
    questionCollection,
} from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";
import { postSystemMessage } from "@/lib/rooms/server";

type Action =
    | "kick"
    | "mute"
    | "unmute"
    | "transfer"
    | "slow_mode"
    | "view_only"
    | "pin"
    | "unpin"
    | "socratic_mode"
    | "link_question";

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;
        const body = await req.json();
        const { action, targetUserId, slowMode, viewOnly, messageId, enabled, seekerId, questionId } = body as {
            action: Action;
            targetUserId?: string;
            slowMode?: string;
            viewOnly?: boolean;
            messageId?: string;
            enabled?: boolean;
            seekerId?: string | null;
            questionId?: string | null;
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

            case "pin": {
                if (!messageId) return NextResponse.json({ error: "No message specified" }, { status: 400 });

                // Verify the message belongs to this room and isn't deleted
                const message = await databases.getDocument(db, roomMessagesCollection, messageId).catch(() => null);
                if (!message || message.roomId !== roomId) {
                    return NextResponse.json({ error: "Message not found" }, { status: 404 });
                }
                if (message.deletedAt) {
                    return NextResponse.json({ error: "Cannot pin a deleted message" }, { status: 400 });
                }

                await databases.updateDocument(db, discussionRoomsCollection, roomId, {
                    pinnedMessageId: messageId,
                });
                return NextResponse.json({ ok: true });
            }

            case "unpin": {
                await databases.updateDocument(db, discussionRoomsCollection, roomId, {
                    pinnedMessageId: null,
                });
                return NextResponse.json({ ok: true });
            }

            case "socratic_mode": {
                if (enabled === true) {
                    if (!seekerId) {
                        return NextResponse.json({ error: "seekerId is required to start Socratic mode" }, { status: 400 });
                    }
                    const seeker = await findMember(seekerId);
                    if (!seeker) {
                        return NextResponse.json({ error: "Seeker is not a member of this room" }, { status: 400 });
                    }

                    await databases.updateDocument(db, discussionRoomsCollection, roomId, {
                        socraticMode: true,
                        socraticSeekerId: seekerId,
                        socraticStartedAt: new Date().toISOString(),
                    });

                    await postSystemMessage(
                        roomId,
                        `🔍 Socratic Debugging Mode started. ${seeker.displayName} is the seeker. Helpers: ask questions only — no direct answers. Support the seeker in finding the root cause themselves.`
                    );
                    return NextResponse.json({ ok: true });
                }

                await databases.updateDocument(db, discussionRoomsCollection, roomId, {
                    socraticMode: false,
                    socraticSeekerId: null,
                    socraticStartedAt: null,
                });

                await postSystemMessage(roomId, "Socratic Debugging Mode ended.");
                return NextResponse.json({ ok: true });
            }

            case "link_question": {
                if (questionId) {
                    let question;
                    try {
                        question = await databases.getDocument(db, questionCollection, questionId);
                    } catch {
                        return NextResponse.json({ error: "Question not found" }, { status: 404 });
                    }

                    await databases.updateDocument(db, discussionRoomsCollection, roomId, {
                        linkedQuestionId: questionId,
                        linkedQuestionTitle: question.title,
                    });

                    await postSystemMessage(roomId, `This room has been linked to the question: ${question.title}`);
                    return NextResponse.json({ ok: true });
                }

                await databases.updateDocument(db, discussionRoomsCollection, roomId, {
                    linkedQuestionId: null,
                    linkedQuestionTitle: null,
                });

                await postSystemMessage(roomId, "Question link removed.");
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
