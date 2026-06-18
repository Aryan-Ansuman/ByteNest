import { commentCollection, db } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";

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
                const author = await users.get<UserPrefs>(comment.authorId as string).catch(() => null);
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
    try {
        const { content, authorId, type, typeId } = await request.json();

        if (!content?.trim() || !authorId || !type || !typeId) {
            return NextResponse.json(
                { error: "content, authorId, type, and typeId are required" },
                { status: 400 }
            );
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
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error creating comment" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { commentId, authorId } = await request.json();

        if (!commentId) {
            return NextResponse.json(
                { error: "commentId is required" },
                { status: 400 }
            );
        }

        const comment = await databases.getDocument(db, commentCollection, commentId);

        if (authorId && comment.authorId !== authorId) {
            return NextResponse.json(
                { error: "You are not authorized to delete this comment" },
                { status: 403 }
            );
        }

        const response = await databases.deleteDocument(db, commentCollection, commentId);

        return NextResponse.json(
            { data: response, message: "Comment deleted" },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error deleting comment" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
