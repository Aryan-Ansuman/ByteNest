import { NextRequest, NextResponse } from "next/server";
import { databases } from "@/models/server/config";
import { db, roomMessagesCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";
import { sanitizeMarkdownSource } from "@/lib/sanitize";

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string; messageId: string } }
) {
    try {
        await getAuthenticatedUserId();
        const message = await databases.getDocument(db, roomMessagesCollection, params.messageId);
        return NextResponse.json({ message });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json({ error: error?.message || "Message not found" }, { status: 404 });
    }
}

// ─── PATCH /api/rooms/[id]/messages/[messageId] — edit a message ──────────────
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string; messageId: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { messageId } = params;
        const { body } = await req.json();

        if (!body?.trim()) {
            return NextResponse.json({ error: "Empty message" }, { status: 400 });
        }
        if (body.length > 4000) {
            return NextResponse.json({ error: "Message too long" }, { status: 400 });
        }

        const message = await databases.getDocument(db, roomMessagesCollection, messageId);

        if (message.authorId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (message.deletedAt) {
            return NextResponse.json({ error: "Cannot edit a deleted message" }, { status: 400 });
        }

        const cleanBody = sanitizeMarkdownSource(body);
        const updated = await databases.updateDocument(db, roomMessagesCollection, messageId, {
            body: cleanBody,
            editedAt: new Date().toISOString(),
        });

        return NextResponse.json({ message: updated });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json({ error: error?.message || "Error editing message" }, { status: 500 });
    }
}

// ─── DELETE /api/rooms/[id]/messages/[messageId] — soft-delete ───────────────
export async function DELETE(
    _req: NextRequest,
    { params }: { params: { id: string; messageId: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { messageId } = params;

        const message = await databases.getDocument(db, roomMessagesCollection, messageId);

        if (message.authorId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const updated = await databases.updateDocument(db, roomMessagesCollection, messageId, {
            deletedAt: new Date().toISOString(),
        });

        return NextResponse.json({ message: updated });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json({ error: error?.message || "Error deleting message" }, { status: 500 });
    }
}
