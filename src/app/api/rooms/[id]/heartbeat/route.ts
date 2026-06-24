import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, roomMembersCollection } from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;
        const { status } = await req.json().catch(() => ({ status: "online" }));

        const existing = await databases.listDocuments(
            db,
            roomMembersCollection,
            [
                Query.equal("roomId", roomId),
                Query.equal("userId", userId),
                Query.limit(1),
            ]
        );

        if (existing.total === 0) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        const memberDoc = existing.documents[0];

        // Don't override muted status with presence updates
        const newStatus =
            memberDoc.status === "muted" ? "muted" : (status ?? "online");

        await databases.updateDocument(db, roomMembersCollection, memberDoc.$id, {
            lastSeenAt: new Date().toISOString(),
            status: newStatus,
        });

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error updating heartbeat" },
            { status: error?.status || 500 }
        );
    }
}
