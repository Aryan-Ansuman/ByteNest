import { NextRequest, NextResponse } from "next/server";
import { Query, ID } from "node-appwrite";
import { databases, users } from "@/models/server/config";
import {
    db,
    discussionRoomsCollection,
    roomMembersCollection,
    roomMessagesCollection,
} from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";
import { getAvatarColor } from "@/lib/getAvatarColor";
import { generateInviteToken } from "@/utils/token";

// ─── GET /api/rooms — list active public rooms ────────────────────────────
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const tag = searchParams.get("tag");

        const queries = [
            Query.equal("status", "active"),
            Query.equal("visibility", "public"),
            Query.orderDesc("memberCount"),
            Query.limit(50),
        ];

        if (tag) queries.push(Query.search("tags", tag));

        const result = await databases.listDocuments(
            db,
            discussionRoomsCollection,
            queries
        );

        return NextResponse.json({ rooms: result.documents });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error fetching rooms" },
            { status: 500 }
        );
    }
}

// ─── POST /api/rooms — create a new room ──────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const userId = await getAuthenticatedUserId();
        const body = await req.json();

        const { name, description, tags, visibility, maxMembers, slowMode } = body;

        if (!name?.trim()) {
            return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        if (name.trim().length > 100) {
            return NextResponse.json({ error: "Name must be under 100 characters" }, { status: 400 });
        }

        const user = await users.get(userId);
        const now = new Date().toISOString();
        const avatarColor = getAvatarColor(userId);
        const displayName = user.name || "Anonymous";

        const room = await databases.createDocument(
            db,
            discussionRoomsCollection,
            ID.unique(),
            {
                hostId: userId,
                name: name.trim(),
                description: description?.trim() ?? "",
                tags: tags ?? [],
                visibility: visibility ?? "public",
                status: "active",
                memberCount: 1,
                maxMembers: maxMembers ?? 50,
                lastActivityAt: now,
                activeCodeSessionId: null,
                inviteToken: visibility === "private" ? generateInviteToken() : null,
                slowMode: slowMode ?? "off",
            }
        );

        // Create host as first member + system message atomically
        await Promise.all([
            databases.createDocument(db, roomMembersCollection, ID.unique(), {
                roomId: room.$id,
                userId,
                displayName,
                avatarColor,
                role: "host",
                status: "online",
                joinedAt: now,
                lastSeenAt: now,
            }),
            databases.createDocument(db, roomMessagesCollection, ID.unique(), {
                roomId: room.$id,
                authorId: "system",
                authorName: "System",
                authorColor: "indigo",
                body: `${displayName} created the room`,
                type: "system",
                reactions: JSON.stringify({}),
            }),
        ]);

        return NextResponse.json({ room }, { status: 201 });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error creating room" },
            { status: error?.status || 500 }
        );
    }
}
