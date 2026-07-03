import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import {
    db,
    roomMembersCollection,
    roomMessagesCollection,
    discussionRoomsCollection,
} from "@/models/name";
import { forbiddenResponse } from "@/lib/auth";

export async function getRoomMember(roomId: string, userId: string) {
    const result = await databases.listDocuments(db, roomMembersCollection, [
        Query.equal("roomId", roomId),
        Query.equal("userId", userId),
        Query.limit(1),
    ]);

    return result.documents[0] ?? null;
}

export async function requireRoomMember(roomId: string, userId: string) {
    const member = await getRoomMember(roomId, userId);
    if (!member) {
        throw forbiddenResponse("Not a member of this room");
    }

    return member;
}

export async function countActiveRoomMembers(roomId: string) {
    const result = await databases.listDocuments(db, roomMembersCollection, [
        Query.equal("roomId", roomId),
        Query.notEqual("status", "offline"),
        Query.limit(1),
    ]);

    return result.total;
}

export async function syncRoomMemberCount(roomId: string) {
    const memberCount = await countActiveRoomMembers(roomId);
    await databases.updateDocument(db, discussionRoomsCollection, roomId, {
        memberCount,
    });
    return memberCount;
}

export async function countRoomMessages(roomId: string) {
    const result = await databases.listDocuments(db, roomMessagesCollection, [
        Query.equal("roomId", roomId),
        Query.isNull("deletedAt"),
        Query.notEqual("type", "system"),
        Query.limit(1),
    ]);

    return result.total;
}
