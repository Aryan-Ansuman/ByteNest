import { NextRequest, NextResponse } from "next/server";
import { Query, ID } from "node-appwrite";
import { databases } from "@/models/server/config";
import {
    db,
    discussionRoomsCollection,
    roomMembersCollection,
    roomMessagesCollection,
} from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";
import { checkGlobalMessageLimit } from "@/lib/messageLimits";
import { sanitizeMarkdownSource } from "@/lib/sanitize";
import { requireRoomMember } from "@/lib/rooms/server";
import { isInterrogative, getSocraticHint } from "@/lib/socratic/interrogativeCheck";

const SLOW_MODE_MS: Record<string, number> = {
    off: 0,
    "5s": 5000,
    "30s": 30000,
    "60s": 60000,
};

// ─── GET /api/rooms/[id]/messages — paginated message history ─────────────
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;
        const { searchParams } = new URL(req.url);
        const before = searchParams.get("before");
        const limit = 50;

        await requireRoomMember(roomId, userId);

        const queries = [
            Query.equal("roomId", roomId),
            Query.isNull("deletedAt"),
            Query.orderDesc("$createdAt"),
            Query.limit(limit + 1),
        ];

        if (before) queries.push(Query.lessThan("$createdAt", before));

        const result = await databases.listDocuments(
            db,
            roomMessagesCollection,
            queries
        );

        const page = result.documents.slice(0, limit);

        return NextResponse.json({
            messages: page.reverse(),
            hasMore: result.documents.length > limit,
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error fetching messages" },
            { status: error?.status || 500 }
        );
    }
}

// ─── POST /api/rooms/[id]/messages — send a message ──────────────────────
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;

        // 1. Global rate limit: 100 messages/min per user (Appwrite-backed)
        const rl = await checkGlobalMessageLimit(userId);
        if (!rl.allowed) {
            return NextResponse.json(
                { error: "Rate limit exceeded", retryAfter: rl.retryAfter },
                {
                    status: 429,
                    headers: {
                        "Retry-After": String(rl.retryAfter ?? 60),
                        "X-RateLimit-Limit": "100",
                    },
                }
            );
        }

        // 2. Fetch room
        let room;
        try {
            room = await databases.getDocument(db, discussionRoomsCollection, roomId);
        } catch {
            return NextResponse.json({ error: "Room not found" }, { status: 404 });
        }

        if (room.status === "archived") {
            return NextResponse.json({ error: "Room is archived" }, { status: 410 });
        }

        // 3. Verify membership + mute check
        const memberQuery = await databases.listDocuments(
            db,
            roomMembersCollection,
            [
                Query.equal("roomId", roomId),
                Query.equal("userId", userId),
                Query.limit(1),
            ]
        );

        if (memberQuery.total === 0) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        const member = memberQuery.documents[0];

        if (member.status === "muted") {
            return NextResponse.json({ error: "You are muted" }, { status: 403 });
        }

        // 4. Parse + basic validation of body (moved ahead of slow mode so
        // the Socratic guard below — a higher-priority constraint than
        // timing — can inspect it first)
        const { body, type = "text", language, replyToId } = await req.json();

        if (!body?.trim()) {
            return NextResponse.json({ error: "Empty message" }, { status: 400 });
        }

        if (body.length > 4000) {
            return NextResponse.json({ error: "Message too long" }, { status: 400 });
        }

        // 5. Socratic mode enforcement — helpers (anyone but the
        // designated seeker) must send interrogative messages only.
        // Runs after membership/mute checks (so a muted user still gets
        // the mute error) and before slow mode (a higher-priority
        // constraint than timing).
        const isSocraticHelper = room.socraticMode === true && userId !== room.socraticSeekerId;

        if (isSocraticHelper && !isInterrogative(body, type)) {
            return NextResponse.json(
                {
                    error: "Socratic mode active — helpers must ask questions only",
                    hint: getSocraticHint(body),
                },
                { status: 422 }
            );
        }

        // 6. Slow mode enforcement
        const slowMs = SLOW_MODE_MS[room.slowMode] ?? 0;
        if (slowMs > 0) {
            const since = new Date(Date.now() - slowMs).toISOString();
            const recent = await databases.listDocuments(
                db,
                roomMessagesCollection,
                [
                    Query.equal("roomId", roomId),
                    Query.equal("authorId", userId),
                    Query.greaterThan("$createdAt", since),
                    Query.limit(1),
                ]
            );

            if (recent.total > 0) {
                const lastMsgTime = new Date(recent.documents[0].$createdAt).getTime();
                const retryAfter = Math.ceil((lastMsgTime + slowMs - Date.now()) / 1000);
                return NextResponse.json(
                    { error: "Slow mode active", retryAfter: Math.max(retryAfter, 1) },
                    { status: 429 }
                );
            }
        }

        // Code messages are not sanitized (they need raw formatting)
        const cleanBody = type === "code" ? body : sanitizeMarkdownSource(body);

        // Helper messages during Socratic mode are always tagged "question",
        // even if the client sent a different type — this guards against a
        // client-side misclassification bug.
        const resolvedType = isSocraticHelper ? "question" : type;

        // 7. Write message + update lastActivityAt atomically
        const now = new Date().toISOString();

        const [message] = await Promise.all([
            databases.createDocument(db, roomMessagesCollection, ID.unique(), {
                roomId,
                authorId: userId,
                authorName: member.displayName,
                authorColor: member.avatarColor,
                body: cleanBody,
                type: resolvedType,
                language: language ?? null,
                replyToId: replyToId ?? null,
                reactions: JSON.stringify({}),
            }),
            databases.updateDocument(db, discussionRoomsCollection, roomId, {
                lastActivityAt: now,
            }),
        ]);

        return NextResponse.json({ message }, { status: 201 });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error sending message" },
            { status: error?.status || 500 }
        );
    }
}
