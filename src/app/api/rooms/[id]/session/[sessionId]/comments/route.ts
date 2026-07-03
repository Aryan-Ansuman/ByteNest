import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import {
    db,
    codeCommentsCollection,
    codeSessionsCollection,
    roomMembersCollection,
} from "@/models/name";
import { getAuthenticatedUserId } from "@/lib/auth";
import { sanitizeMarkdownSource } from "@/lib/sanitize";

// ─── GET /api/rooms/[id]/session/[sessionId]/comments ─────────────────────
// Returns all comments for the session (optionally filtered to one file).
// Membership is required to read — comments may discuss private code.
export async function GET(
    req: NextRequest,
    { params }: { params: { id: string; sessionId: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId, sessionId } = params;
        const { searchParams } = new URL(req.url);
        const filename = searchParams.get("filename");

        const member = await databases.listDocuments(db, roomMembersCollection, [
            Query.equal("roomId", roomId),
            Query.equal("userId", userId),
            Query.limit(1),
        ]);
        if (member.total === 0) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        const queries = [
            Query.equal("sessionId", sessionId),
            Query.orderAsc("$createdAt"),
            Query.limit(500),
        ];
        if (filename) queries.push(Query.equal("filename", filename));

        const result = await databases.listDocuments(db, codeCommentsCollection, queries);

        return NextResponse.json({ comments: result.documents });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Failed to fetch comments" },
            { status: 500 }
        );
    }
}

// ─── POST /api/rooms/[id]/session/[sessionId]/comments — create comment ───
export async function POST(
    req: NextRequest,
    { params }: { params: { id: string; sessionId: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId, sessionId } = params;

        // 1. Verify membership (and grab display info for the comment author)
        const memberQuery = await databases.listDocuments(db, roomMembersCollection, [
            Query.equal("roomId", roomId),
            Query.equal("userId", userId),
            Query.limit(1),
        ]);
        if (memberQuery.total === 0) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }
        const member = memberQuery.documents[0];

        // 2. Verify the session exists and is active
        const session = await databases.getDocument(db, codeSessionsCollection, sessionId);
        if (session.status !== "active") {
            return NextResponse.json({ error: "Session has ended" }, { status: 410 });
        }

        // 3. Validate body
        const { filename, anchorOffset, lineNumberAtCreate, body, parentId } = await req.json();

        if (!filename || typeof filename !== "string") {
            return NextResponse.json({ error: "filename is required" }, { status: 400 });
        }
        if (typeof anchorOffset !== "number" || anchorOffset < 0) {
            return NextResponse.json({ error: "anchorOffset is required" }, { status: 400 });
        }
        if (!body?.trim()) {
            return NextResponse.json({ error: "Comment cannot be empty" }, { status: 400 });
        }
        if (body.length > 2000) {
            return NextResponse.json({ error: "Comment too long" }, { status: 400 });
        }

        // Replies must point at a real root comment in the same session
        if (parentId) {
            try {
                const parent = await databases.getDocument(db, codeCommentsCollection, parentId);
                if (parent.sessionId !== sessionId) {
                    return NextResponse.json({ error: "Invalid parent comment" }, { status: 400 });
                }
            } catch {
                return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
            }
        }

        const comment = await databases.createDocument(
            db,
            codeCommentsCollection,
            ID.unique(),
            {
                sessionId,
                roomId,
                filename,
                anchorOffset,
                lineNumberAtCreate: typeof lineNumberAtCreate === "number" ? lineNumberAtCreate : 1,
                authorId: userId,
                authorName: member.displayName,
                authorColor: member.avatarColor,
                body: sanitizeMarkdownSource(body),
                parentId: parentId ?? null,
            }
        );

        return NextResponse.json({ comment }, { status: 201 });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Failed to create comment" },
            { status: 500 }
        );
    }
}
