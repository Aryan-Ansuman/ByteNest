import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { databases } from "@/models/server/config";
import { db, discussionRoomsCollection } from "@/models/name";
import crypto from "crypto";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/rooms/[id]/invite
 *
 * Generates a new 32-byte invite token, writes it to the room document,
 * and returns the new invite URL. The old token is immediately invalidated —
 * any existing invite link returns 403 from the join route on next use.
 *
 * Only the room host may call this.
 */
export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // allow at most 5 regenerations per minute per room
        const limited = await rateLimit({
            key: `invite-regen:${params.id}`,
            limit: 5,
            windowMs: 60_000,
        });
        if (!limited.success)
            return NextResponse.json(
                { error: "Rate limit exceeded" },
                { status: 429 }
            );

        const requesterId = await getAuthenticatedUserId();

        const room = await databases.getDocument(
            db,
            discussionRoomsCollection,
            params.id
        );

        if (room.hostId !== requesterId)
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        if (room.status === "archived")
            return NextResponse.json(
                { error: "Room is archived" },
                { status: 410 }
            );
        if (room.visibility !== "private")
            return NextResponse.json(
                { error: "Invite tokens only apply to private rooms" },
                { status: 400 }
            );

        // 32 bytes → 64 hex chars, cryptographically random
        const newToken = crypto.randomBytes(32).toString("hex");

        await databases.updateDocument(
            db,
            discussionRoomsCollection,
            params.id,
            { inviteToken: newToken }
        );

        // derive the invite URL from the request origin header
        const origin =
            req.headers.get("origin") ??
            `${req.nextUrl.protocol}//${req.nextUrl.host}`;

        return NextResponse.json({
            inviteToken: newToken,
            inviteUrl: `${origin}/rooms/join/${newToken}`,
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        if (error.code === 404)
            return NextResponse.json(
                { error: "Room not found" },
                { status: 404 }
            );
        return NextResponse.json(
            { error: error?.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}
