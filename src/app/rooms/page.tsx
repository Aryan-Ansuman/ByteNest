import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, discussionRoomsCollection } from "@/models/name";
import { DiscussionRoom } from "@/types/rooms";
import RoomsClient from "./RoomsClient";

export const dynamic = "force-dynamic";

export default async function RoomsDirectoryPage({
    searchParams,
}: {
    searchParams: { [key: string]: string | string[] | undefined };
}) {
    const tag = typeof searchParams.tag === "string" ? searchParams.tag : undefined;
    const error = typeof searchParams.error === "string" ? searchParams.error : undefined;

    // Server-side query for initial render
    const queries = [
        Query.equal("status", "active"),
        Query.equal("visibility", "public"),
        Query.orderDesc("memberCount"),
        Query.limit(100),
    ];

    if (tag) {
        queries.push(Query.search("tags", tag));
    }

    let initialRooms: DiscussionRoom[] = [];
    try {
        const response = await databases.listDocuments(
            db,
            discussionRoomsCollection,
            queries
        );
        initialRooms = response.documents as unknown as DiscussionRoom[];
    } catch (err) {
        console.error("Failed to fetch public rooms", err);
    }

    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white p-8">
            <div className="max-w-5xl mx-auto space-y-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight mb-2">
                        Discussion Rooms
                    </h1>
                    <p className="text-zinc-400">
                        Join public rooms to chat, collaborate on code, and
                        solve problems together in real-time.
                    </p>
                </div>

                {error === "invalid_invite" && (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm font-medium">
                        The invite link you used is invalid or has expired. You can browse public rooms below.
                    </div>
                )}

                <RoomsClient initialRooms={initialRooms} activeTag={tag} />
            </div>
        </main>
    );
}
