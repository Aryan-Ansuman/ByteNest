import { databases } from "@/models/server/config";
import { db, questionCollection, adrQuestionMetadataCollection } from "@/models/name";
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

    if (q.length < 2) {
        return NextResponse.json({ data: [] }, { status: 200 });
    }

    try {
        const [titleResults, adrOptionMatches] = await Promise.all([
            databases.listDocuments(db, questionCollection, [
                Query.search("title", q),
                Query.limit(6),
                Query.select(["title", "$id", "tags"]),
            ]),
            // optionA/optionB live on the sidecar, not the question document —
            // search there too so e.g. "postgresql" surfaces ADR questions
            // where it's an option even if the (editable) title doesn't
            // mention it.
            databases
                .listDocuments(db, adrQuestionMetadataCollection, [
                    Query.or([Query.search("optionA", q), Query.search("optionB", q)]),
                    Query.limit(6),
                    Query.select(["questionId"]),
                ])
                .catch(() => ({ documents: [] as { questionId: string }[] })),
        ]);

        const seen = new Set(titleResults.documents.map((doc) => doc.$id));
        const suggestions = titleResults.documents.map((doc) => ({
            $id: doc.$id,
            title: doc.title as string,
            tags: (doc.tags as string[]) ?? [],
        }));

        const extraQuestionIds = adrOptionMatches.documents
            .map((doc) => doc.questionId as string)
            .filter((id) => !seen.has(id));

        if (extraQuestionIds.length > 0) {
            const extraQuestions = await databases.listDocuments(db, questionCollection, [
                Query.equal("$id", extraQuestionIds),
                Query.limit(6),
                Query.select(["title", "$id", "tags"]),
            ]);
            for (const doc of extraQuestions.documents) {
                if (seen.has(doc.$id)) continue;
                seen.add(doc.$id);
                suggestions.push({
                    $id: doc.$id,
                    title: doc.title as string,
                    tags: (doc.tags as string[]) ?? [],
                });
            }
        }

        return NextResponse.json(
            { data: suggestions.slice(0, 6) },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Search failed" },
            { status: error?.status || 500 }
        );
    }
}
