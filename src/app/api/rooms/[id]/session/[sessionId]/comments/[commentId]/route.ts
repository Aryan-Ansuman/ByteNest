import { NextRequest, NextResponse } from "next/server";
import { databases } from "@/models/server/config";
import {
    db,
    codeCommentsCollection,
    discussionRoomsCollection,
} from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

// ─── PATCH — resolve / unresolve / edit a comment ──────────────────────────
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string; sessionId: string; commentId: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId, commentId } = params;

        const comment = await databases.getDocument(db, codeCommentsCollection, commentId);
        const { action } = await req.json();

        const room = await databases.getDocument(db, discussionRoomsCollection, roomId);
        const isHost = room.hostId === userId;
        const isAuthor = comment.authorId === userId;

        if (action === "resolve") {
            // Author or host can mark a thread resolved
            if (!isAuthor && !isHost) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            const updated = await databases.updateDocument(db, codeCommentsCollection, commentId, {
                resolvedAt: new Date().toISOString(),
                resolvedBy: userId,
            });
            return NextResponse.json({ comment: updated });
        }

        if (action === "unresolve") {
            if (!isAuthor && !isHost) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            const updated = await databases.updateDocument(db, codeCommentsCollection, commentId, {
                resolvedAt: null,
                resolvedBy: null,
            });
            return NextResponse.json({ comment: updated });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Failed to update comment" },
            { status: 500 }
        );
    }
}

// ─── DELETE — author or host only ──────────────────────────────────────────
export async function DELETE(
    _req: NextRequest,
    { params }: { params: { id: string; sessionId: string; commentId: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId, commentId } = params;

        const comment = await databases.getDocument(db, codeCommentsCollection, commentId);
        const room = await databases.getDocument(db, discussionRoomsCollection, roomId);
        const isHost = room.hostId === userId;
        const isAuthor = comment.authorId === userId;

        if (!isAuthor && !isHost) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await databases.deleteDocument(db, codeCommentsCollection, commentId);
        return NextResponse.json({ ok: true });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Failed to delete comment" },
            { status: 500 }
        );
    }
}
