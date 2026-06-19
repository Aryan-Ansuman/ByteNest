import { commentCollection, db } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { getAuthenticatedUserId, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get("type");
        const typeId = searchParams.get("typeId");

        if (!type || !typeId) {
            return NextResponse.json(
                { error: "type and typeId are required" },
                { status: 400 }
            );
        }

        const comments = await databases.listDocuments(db, commentCollection, [
            Query.equal("type", type),
            Query.equal("typeId", typeId),
            Query.orderDesc("$createdAt"),
        ]);

        const hydrated = await Promise.all(
            comments.documents.map(async (comment) => {
                const author = await users
                    .get<UserPrefs>(comment.authorId as string)
                    .catch(() => null);
                return {
                    ...comment,
                    author: {
                        $id: author?.$id ?? "deleted",
                        name: author?.name ?? "Deleted User",
                        reputation: author?.prefs?.reputation ?? 0,
                    },
                };
            })
        );

        return NextResponse.json(
            { data: { total: comments.total, documents: hydrated } },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error fetching comments" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    let requesterId: string;
    try {
        requesterId = await getAuthenticatedUserId();
    } catch (authError) {
        if (authError instanceof Response) return authError;
        return unauthorizedResponse("Authentication required");
    }

    try {
        const { content, authorId, type, typeId } = await request.json();

        if (!content?.trim() || !authorId || !type || !typeId) {
            return NextResponse.json(
                { error: "content, authorId, type, and typeId are required" },
                { status: 400 }
            );
        }

        // The client sends the user's own ID; verify it matches the session.
        if (authorId !== requesterId) {
            return forbiddenResponse("authorId does not match authenticated user");
        }

        const [comment, author] = await Promise.all([
            databases.createDocument(db, commentCollection, ID.unique(), {
                content: content.trim(),
                authorId,
                type,
                typeId,
            }),
            users.get<UserPrefs>(authorId),
        ]);

        const hydrated = {
            ...comment,
            author: {
                $id: author.$id,
                name: author.name,
                reputation: author.prefs?.reputation ?? 0,
            },
        };

        return NextResponse.json({ data: hydrated }, { status: 201 });
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error creating comment" },
            { status: e?.status || e?.code || 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    let requesterId: string;
    try {
        requesterId = await getAuthenticatedUserId();
    } catch (authError) {
        if (authError instanceof Response) return authError;
        return unauthorizedResponse("Authentication required");
    }

    try {
        const { commentId } = await request.json();

        if (!commentId) {
            return NextResponse.json({ error: "commentId is required" }, { status: 400 });
        }

        let comment: Awaited<ReturnType<typeof databases.getDocument>>;
        try {
            comment = await databases.getDocument(db, commentCollection, commentId);
        } catch {
            // Already deleted — idempotent success.
            return NextResponse.json(
                { data: { $id: commentId }, message: "Comment not found or already deleted" },
                { status: 200 }
            );
        }

        // Ownership check against the live document — no client-supplied bypass possible.
        if (comment.authorId !== requesterId) {
            return forbiddenResponse("You are not the author of this comment");
        }

        const response = await databases.deleteDocument(db, commentCollection, commentId);

        return NextResponse.json(
            { data: response, message: "Comment deleted" },
            { status: 200 }
        );
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error deleting comment" },
            { status: e?.status || e?.code || 500 }
        );
    }
}
