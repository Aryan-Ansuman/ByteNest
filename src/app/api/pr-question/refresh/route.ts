/**
 * POST /api/pr-question/refresh
 *
 * PR-Linked Q&A — Phase 7. The manual fallback for repos where webhook
 * registration failed (private repos ByteNest isn't an admin on — see
 * webhook-registration.ts). Re-fetches PR metadata and updates prStatus;
 * does NOT touch the diff — that's the heavier RefreshPrDiff flow, webhook
 * "synchronize"-triggered only.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { db, questionCollection, prQuestionMetadataCollection } from "@/models/name";
import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { fetchPrMetadata } from "@/lib/github";
import { GithubApiError } from "@/lib/github/types";

const REFRESH_LIMIT = 1;
const REFRESH_WINDOW_MS = 60_000; // 1 refresh per question per 60s

export async function POST(request: NextRequest) {
    let requesterId: string;
    try {
        requesterId = await getAuthenticatedUserId();
    } catch (authError) {
        if (authError instanceof Response) return authError;
        return unauthorizedResponse("Authentication required");
    }

    let questionId: string;
    try {
        ({ questionId } = await request.json());
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    if (!questionId) {
        return NextResponse.json({ error: "questionId is required" }, { status: 400 });
    }

    const rl = await rateLimit({
        key: `pr-question-refresh:${questionId}`,
        limit: REFRESH_LIMIT,
        windowMs: REFRESH_WINDOW_MS,
    });
    const rlHeaders = rateLimitHeaders(rl, REFRESH_LIMIT);
    if (!rl.success) {
        return NextResponse.json(
            { error: "This PR was just refreshed. Try again in a minute." },
            { status: 429, headers: rlHeaders }
        );
    }

    let question;
    try {
        question = await databases.getDocument(db, questionCollection, questionId);
    } catch {
        return NextResponse.json({ error: "Question not found" }, { status: 404, headers: rlHeaders });
    }

    if (!question.isPr) {
        return NextResponse.json({ error: "This question is not linked to a Pull Request" }, { status: 400, headers: rlHeaders });
    }

    const metadataQuery = await databases.listDocuments(db, prQuestionMetadataCollection, [
        Query.equal("questionId", questionId),
        Query.limit(1)
    ]);

    if (metadataQuery.total === 0) {
        return NextResponse.json({ error: "Missing PR metadata on this question" }, { status: 400, headers: rlHeaders });
    }

    const metadataDoc = metadataQuery.documents[0];
    const owner = metadataDoc.prRepoOwner as string | undefined;
    const repoName = metadataDoc.prRepoName as string | undefined;
    const prNumber = metadataDoc.prNumber as number | undefined;

    if (!owner || !repoName || !prNumber) {
        return NextResponse.json({ error: "Incomplete PR metadata on this question" }, { status: 400, headers: rlHeaders });
    }

    try {
        const metadata = await fetchPrMetadata(owner, repoName, prNumber);
        const now = new Date().toISOString();

        await Promise.all([
            databases.updateDocument(db, prQuestionMetadataCollection, metadataDoc.$id, {
                prStatus: metadata.status,
                prMergedAt: metadata.mergedAt,
                prClosedAt: metadata.closedAt,
            }),
            databases.updateDocument(db, questionCollection, questionId, {
                activityAt: now,
            }).catch(() => undefined) // best effort update
        ]);

        return NextResponse.json(
            {
                data: {
                    prStatus: metadata.status,
                    prMergedAt: metadata.mergedAt,
                    prClosedAt: metadata.closedAt,
                },
            },
            { status: 200, headers: rlHeaders }
        );
    } catch (error) {
        if (error instanceof GithubApiError) {
            return NextResponse.json({ error: error.message, code: error.reason }, { status: 502, headers: rlHeaders });
        }
        return NextResponse.json({ error: "Couldn't refresh this PR's status. Please try again." }, { status: 500, headers: rlHeaders });
    }
}
