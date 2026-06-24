import { NextRequest, NextResponse } from "next/server";
import { databases } from "@/models/server/config";
import { db, roomMessagesCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string; messageId: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { messageId } = params;
        const { emoji } = await req.json();

        if (!emoji) {
            return NextResponse.json({ error: "No emoji provided" }, { status: 400 });
        }

        const msg = await databases.getDocument(db, roomMessagesCollection, messageId);

        const reactions: Record<string, string[]> = JSON.parse(
            msg.reactions || "{}"
        );

        if (!reactions[emoji]) reactions[emoji] = [];

        const idx = reactions[emoji].indexOf(userId);
        if (idx === -1) {
            // Add reaction
            reactions[emoji].push(userId);
        } else {
            // Remove reaction (toggle)
            reactions[emoji].splice(idx, 1);
            if (reactions[emoji].length === 0) delete reactions[emoji];
        }

        const updated = await databases.updateDocument(
            db,
            roomMessagesCollection,
            messageId,
            { reactions: JSON.stringify(reactions) }
        );

        return NextResponse.json({ message: updated });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error toggling reaction" },
            { status: error?.status || 500 }
        );
    }
}
