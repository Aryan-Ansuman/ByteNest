import { commentCollection, db } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { ApiValidationError, parseJsonBody, requireEnum, requireString } from "@/lib/api-validation";

const COMMENT_TYPES = ["question", "answer"] as const;

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const typeParam = searchParams.get("type");
        const typeId = searchParams.get("typeId");

        if (!typeParam || !typeId) {
            return NextResponse.json({ error: "type and typeId are required" }, { status: 400 });
        }

        const type = requireEnum(typeParam, COMMENT_TYPES, "type");

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
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error fetching comments" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);

        const content = requireString(body.content, "content", { max: 10000 });
        const authorId = requireString(body.authorId, "authorId");
        const type = requireEnum(body.type, COMMENT_TYPES, "type");
        const typeId = requireString(body.typeId, "typeId");

        const [comment, author] = await Promise.all([
            databases.createDocument(db, commentCollection, ID.unique(), {
                content,
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
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error creating comment" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

/**
 * DELETE /api/comment
 * authorId is now required and always checked against the comment's
 * author — previously an omitted authorId silently skipped the ownership
 * check, letting anyone delete any comment by just knowing its id.
 */
export async function DELETE(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);
        const commentId = requireString(body.commentId, "commentId");
        const authorId = requireString(body.authorId, "authorId");

        const comment = await databases.getDocument(db, commentCollection, commentId);

        if (comment.authorId !== authorId) {
            return NextResponse.json(
                { error: "You are not authorized to delete this comment" },
                { status: 403 }
            );
        }

        const response = await databases.deleteDocument(db, commentCollection, commentId);

        return NextResponse.json({ data: response, message: "Comment deleted" }, { status: 200 });
    } catch (error: any) {
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error deleting comment" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
