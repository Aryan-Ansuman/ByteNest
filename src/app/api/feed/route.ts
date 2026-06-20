import { databases } from "@/models/server/config";
import { answerCollection, db, questionCollection } from "@/models/name";
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { deletedAuthor, getAuthorsById } from "@/lib/authors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = request.nextUrl;
        const filter = searchParams.get("filter") ?? "Newest";
        const cursor = searchParams.get("cursor");
        const limit = 10;

        const queries: any[] = [Query.limit(limit)];

        if (filter === "Trending") {
            queries.push(Query.orderDesc("totalVotes"));
        } else {
            queries.push(Query.orderDesc("$createdAt"));
        }

        if (cursor) queries.push(Query.cursorAfter(cursor));

        const result = await databases.listDocuments(db, questionCollection, queries);

        const authorById = await getAuthorsById(
            result.documents.map((q) => q.authorId as string)
        );

        const questions = result.documents.map((q) => {
            const author = authorById.get(q.authorId as string) ?? deletedAuthor;
            return {
                $id: q.$id,
                title: q.title as string,
                content: q.content as string,
                tags: (q.tags as string[]) ?? [],
                $createdAt: q.$createdAt,
                totalAnswers: Number(q.totalAnswers ?? 0),
                totalVotes: Number(q.totalVotes ?? 0),
                author,
            };
        });

        const nextCursor =
            result.documents.length === limit
                ? result.documents[result.documents.length - 1].$id
                : undefined;

        return NextResponse.json(
            {
                questions,
                nextCursor,
                hasMore: result.documents.length === limit,
            },
            {
                status: 200,
                headers: { "Cache-Control": "no-store" },
            }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Failed to load feed" },
            { status: error?.status || 500 }
        );
    }
}
