import { databases } from "@/models/server/config";
import { db, questionCollection } from "@/models/name";
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
        return NextResponse.json({ data: [] }, { status: 200 });
    }

    try {
        const results = await databases.listDocuments(db, questionCollection, [
            Query.search("title", q),
            Query.limit(6),
            Query.select(["title", "$id", "tags"]),
        ]);

        const suggestions = results.documents.map((doc) => ({
            $id: doc.$id,
            title: doc.title as string,
            tags: (doc.tags as string[]) ?? [],
        }));

        return NextResponse.json(
            { data: suggestions },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Search failed" },
            { status: error?.status || 500 }
        );
    }
}
