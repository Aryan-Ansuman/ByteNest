import { NextRequest, NextResponse } from "next/server";
import { ID } from "node-appwrite";
import { databases } from "@/models/server/config";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
    db,
    discussionRoomsCollection,
    codeSessionsCollection,
    roomMessagesCollection,
} from "@/models/name";

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();

        const { id: roomId } = params;

        const room = await databases.getDocument(
            db,
            discussionRoomsCollection,
            roomId
        );

        if (room.hostId !== userId) {
            return NextResponse.json(
                { error: "Only the host can start a session" },
                { status: 403 }
            );
        }

        if (room.activeCodeSessionId) {
            return NextResponse.json(
                { error: "Session already active" },
                { status: 409 }
            );
        }

        const { language = "javascript", filename = "index.js" } = await req
            .json()
            .catch(() => ({}));

        const session = await databases.createDocument(
            db,
            codeSessionsCollection,
            ID.unique(),
            {
                roomId,
                hostId: userId,
                status: "active",
                files: JSON.stringify([{ name: filename, language }]),
                activeFile: filename,
                viewOnly: false,
            }
        );

        await Promise.all([
            databases.updateDocument(db, discussionRoomsCollection, roomId, {
                activeCodeSessionId: session.$id,
                lastActivityAt: new Date().toISOString(),
            }),
            databases.createDocument(db, roomMessagesCollection, ID.unique(), {
                roomId,
                authorId: "system",
                authorName: "System",
                authorColor: "indigo",
                body: `Host started a code session`,
                type: "system",
                reactions: JSON.stringify({}),
            }),
        ]);

        return NextResponse.json({ session }, { status: 201 });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
