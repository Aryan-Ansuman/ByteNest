import { commentCollection, db } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { getAuthenticatedUserId, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizeMarkdownSource } from "@/lib/sanitize";

// Rate limit: 20 comments per user per 5 minutes
const COMMENT_RATE_LIMIT = 20;
const COMMENT_WINDOW_MS = 5 * 60_000;

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

    // Rate limit per authenticated user
    const rl = await rateLimit({
        key: `comment:${requesterId}`,
        limit: COMMENT_RATE_LIMIT,
        windowMs: COMMENT_WINDOW_MS,
    });
    const rlHeaders = rateLimitHeaders(rl, COMMENT_RATE_LIMIT);

    if (!rl.success) {
        return NextResponse.json(
            { error: "Too many comments. Please slow down." },
            { status: 429, headers: rlHeaders }
        );
    }

    try {
        const { content, authorId, type, typeId, parentId } = await request.json();

        if (!content?.trim() || !authorId || !type || !typeId) {
            return NextResponse.json(
                { error: "content, authorId, type, and typeId are required" },
                { status: 400, headers: rlHeaders }
            );
        }

        if (authorId !== requesterId) {
            return forbiddenResponse("authorId does not match authenticated user");
        }

        // Sanitize before storing
        const sanitized = sanitizeMarkdownSource(content.trim());
        if (sanitized.length < 1) {
            return NextResponse.json(
                { error: "Comment content is empty after sanitization" },
                { status: 400, headers: rlHeaders }
            );
        }

        const normalizedParentId =
            typeof parentId === "string" && parentId.trim()
                ? parentId.trim()
                : null;

        if (normalizedParentId) {
            const parentComment = await databases
                .getDocument(db, commentCollection, normalizedParentId)
                .catch(() => null);

            if (!parentComment) {
                return NextResponse.json(
                    { error: "Parent comment not found" },
                    { status: 404, headers: rlHeaders }
                );
            }

            if (parentComment.type !== type || parentComment.typeId !== typeId) {
                return NextResponse.json(
                    { error: "Parent comment belongs to a different thread" },
                    { status: 400, headers: rlHeaders }
                );
            }
        }

        const [comment, author] = await Promise.all([
            databases.createDocument(db, commentCollection, ID.unique(), {
                content: sanitized,
                authorId,
                type,
                typeId,
                ...(normalizedParentId ? { parentId: normalizedParentId } : {}),
            }),
            users.get<UserPrefs>(authorId),
        ]);

        const hydrated = {
            ...comment,
            parentId: (comment.parentId as string | undefined) ?? null,
            author: {
                $id: author.$id,
                name: author.name,
                reputation: author.prefs?.reputation ?? 0,
            },
        };

        return NextResponse.json({ data: hydrated }, { status: 201, headers: rlHeaders });
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error creating comment" },
            { status: e?.status || e?.code || 500, headers: rlHeaders }
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
            return NextResponse.json(
                { data: { $id: commentId }, message: "Comment not found or already deleted" },
                { status: 200 }
            );
        }

        if (comment.authorId !== requesterId) {
            return forbiddenResponse("You are not the author of this comment");
        }

        const relatedComments = await databases.listDocuments(db, commentCollection, [
            Query.equal("type", comment.type as string),
            Query.equal("typeId", comment.typeId as string),
            Query.limit(5000),
        ]);
        const deletedIds = Array.from(
            getCommentSubtreeIds(relatedComments.documents as any[], commentId)
        );

        await Promise.all(
            deletedIds.map((id) => databases.deleteDocument(db, commentCollection, id))
        );

        return NextResponse.json(
            { data: { $id: commentId, deletedIds }, message: "Comment deleted" },
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

function getCommentSubtreeIds(
    comments: Array<{ $id: string; parentId?: string | null }>,
    rootId: string
) {
    const ids = new Set<string>();
    const childrenByParent = new Map<string, Array<{ $id: string }>>();

    for (const comment of comments) {
        if (!comment.parentId) continue;
        const siblings = childrenByParent.get(comment.parentId) ?? [];
        siblings.push(comment);
        childrenByParent.set(comment.parentId, siblings);
    }

    const visit = (commentId: string) => {
        if (ids.has(commentId)) return;
        ids.add(commentId);
        for (const child of childrenByParent.get(commentId) ?? []) {
            visit(child.$id);
        }
    };

    visit(rootId);

    return ids;
}
