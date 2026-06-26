import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, discussionRoomsCollection, roomMessagesCollection, roomMembersCollection } from "@/models/name";
import { DiscussionRoom, RoomMessage, RoomMember } from "@/types/rooms";
import RoomsClient, { EnrichedRoom } from "./RoomsClient";

export const dynamic = "force-dynamic";

export default async function RoomsDirectoryPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const errorParam = typeof searchParams.error === "string" ? searchParams.error : undefined;

    // Fetch all active public rooms
    let rooms: DiscussionRoom[] = [];
    try {
        const res = await databases.listDocuments(db, discussionRoomsCollection, [
            Query.equal("status", "active"),
            Query.equal("visibility", "public"),
            Query.orderDesc("memberCount"),
            Query.limit(50),
        ]);
        rooms = res.documents as unknown as DiscussionRoom[];
    } catch (err) {
        console.error("Failed to fetch rooms:", err);
    }

    if (rooms.length === 0) {
        return <RoomsClient enrichedRooms={[]} errorParam={errorParam} />;
    }

    // Enrich each room with last message + online member avatars (parallel)
    const enriched: EnrichedRoom[] = await Promise.all(
        rooms.map(async (room) => {
            const [msgRes, memberRes] = await Promise.allSettled([
                databases.listDocuments(db, roomMessagesCollection, [
                    Query.equal("roomId", room.$id),
                    Query.isNull("deletedAt"),
                    Query.orderDesc("$createdAt"),
                    Query.limit(1),
                ]),
                databases.listDocuments(db, roomMembersCollection, [
                    Query.equal("roomId", room.$id),
                    Query.notEqual("status", "offline"),
                    Query.limit(5),
                ]),
            ]);

            const lastMessage =
                msgRes.status === "fulfilled" && msgRes.value.documents.length > 0
                    ? (msgRes.value.documents[0] as unknown as RoomMessage)
                    : undefined;

            const onlineMembers =
                memberRes.status === "fulfilled"
                    ? (memberRes.value.documents as unknown as RoomMember[])
                    : [];

            return { ...room, lastMessage, onlineMembers };
        })
    );

    return <RoomsClient enrichedRooms={enriched} errorParam={errorParam} />;
}
