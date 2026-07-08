/**
 * GET /api/pr-question/check?prUrl=...
 *
 * PR-Linked Q&A — Phase 3, Step 1. Lightweight lookup used before the
 * client ever calls the GitHub API: does a pr_linked question already
 * exist for this exact PR? Doesn't block creation (a different question
 * about the same PR is legitimate) — just surfaces the existing one so the
 * user can link to it instead of duplicating.
 */
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, questionCollection, prQuestionMetadataCollection } from "@/models/name";
import { parsePrUrl, toCanonicalPrUrl } from "@/lib/github";
import { GithubApiError } from "@/lib/github/types";

export async function GET(request: NextRequest) {
    const rawPrUrl = request.nextUrl.searchParams.get("prUrl") ?? "";

    let canonicalUrl: string;
    try {
        canonicalUrl = toCanonicalPrUrl(parsePrUrl(rawPrUrl));
    } catch (error) {
        if (error instanceof GithubApiError) {
            return NextResponse.json({ error: error.message, code: error.reason }, { status: 400 });
        }
        return NextResponse.json({ error: "Invalid prUrl" }, { status: 400 });
    }

    try {
        const existingMetadata = await databases.listDocuments(db, prQuestionMetadataCollection, [
            Query.equal("prUrl", canonicalUrl),
            Query.limit(1),
            Query.select(["questionId"]),
        ]);

        if (existingMetadata.total === 0) {
            return NextResponse.json({ data: { exists: false } }, { status: 200 });
        }

        const questionId = existingMetadata.documents[0].questionId as string;
        
        let title = "Unknown Question";
        try {
            const question = await databases.getDocument(db, questionCollection, questionId, [
                Query.select(["title"])
            ]);
            title = question.title as string;
        } catch {
            // If the question is orphaned, just proceed
        }

        return NextResponse.json(
            { data: { exists: true, questionId, title } },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error checking for an existing PR question" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
