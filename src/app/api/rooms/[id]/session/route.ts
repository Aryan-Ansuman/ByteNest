import { NextRequest, NextResponse } from "next/server";
import { ID } from "node-appwrite";
import * as Y from "yjs";
import { databases } from "@/models/server/config";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
    db,
    discussionRoomsCollection,
    codeSessionsCollection,
    roomMessagesCollection,
} from "@/models/name";
import {
    normalizeSessionLanguage,
    validateSessionFilename,
} from "@/lib/rooms/files";
import { requireRoomMember } from "@/lib/rooms/server";

// yjsSnapshotB64 is a 1,000,000-char string attribute (see
// code-sessions.collection.ts) — a generous but real ceiling. Reject
// absurdly large templates up front rather than letting Appwrite's
// attribute-length validation surface a confusing 400 later.
const MAX_INITIAL_CONTENT_CHARS = 50_000;

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();

        const { id: roomId } = params;
        await requireRoomMember(roomId, userId);

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

        const {
            language = "javascript",
            filename = "index.js",
            initialContent = "",
        } = await req.json().catch(() => ({}));

        const languageValue = normalizeSessionLanguage(language);
        const filenameResult = validateSessionFilename(filename);

        if (filenameResult.error !== null) {
            return NextResponse.json(
                { error: filenameResult.error },
                { status: 400 }
            );
        }

        if (typeof initialContent !== "string") {
            return NextResponse.json(
                { error: "initialContent must be a string" },
                { status: 400 }
            );
        }
        if (initialContent.length > MAX_INITIAL_CONTENT_CHARS) {
            return NextResponse.json(
                { error: "Template content is too large" },
                { status: 400 }
            );
        }

        // If a template was chosen, seed the Yjs document with its
        // boilerplate as the *first* CRDT update, then store the encoded
        // state as the session's snapshot. useCodeSession hydrates every
        // client — including the host's own first paint — from this
        // snapshot, so the template content is already present the moment
        // the editor binds, with no extra round trip and no "type it in
        // after the fact" race against collaborators joining immediately.
        let yjsSnapshotB64: string | undefined;
        if (initialContent.length > 0) {
            const seedDoc = new Y.Doc();
            try {
                seedDoc.getText(filenameResult.name).insert(0, initialContent);
                const update = Y.encodeStateAsUpdate(seedDoc);
                yjsSnapshotB64 = Buffer.from(update).toString("base64");
            } finally {
                seedDoc.destroy();
            }
        }

        const session = await databases.createDocument(
            db,
            codeSessionsCollection,
            ID.unique(),
            {
                roomId,
                hostId: userId,
                status: "active",
                files: JSON.stringify([{ name: filenameResult.name, language: languageValue }]),
                activeFile: filenameResult.name,
                viewOnly: false,
                ...(yjsSnapshotB64 ? { yjsSnapshotB64 } : {}),
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
