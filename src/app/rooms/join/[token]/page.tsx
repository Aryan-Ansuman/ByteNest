import { redirect } from "next/navigation";
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, discussionRoomsCollection } from "@/models/name";
import { DiscussionRoom } from "@/types/rooms";

export const dynamic = "force-dynamic";

export default async function JoinRoomPage({
    params,
}: {
    params: { token: string };
}) {
    try {
        const { token } = params;

        const response = await databases.listDocuments(
            db,
            discussionRoomsCollection,
            [
                Query.equal("inviteToken", token),
                Query.equal("status", "active"),
                Query.limit(1),
            ]
        );

        if (response.total === 0) {
            // Not found, invalid, or expired/archived
            redirect("/rooms?error=invalid_invite");
        }

        const room = response.documents[0] as unknown as DiscussionRoom;

        // Redirect to the room page, carrying the token so the page can pass it to POST /api/rooms/[id]/join
        redirect(`/rooms/${room.$id}?token=${token}`);
    } catch (err: any) {
        // Appwrite query failed or Next.js redirect threw
        if (err.message === "NEXT_REDIRECT") throw err; // rethrow so Next.js handles it
        
        console.error("Join room error:", err);
        redirect("/rooms?error=invalid_invite");
    }
}
