/**
 * POST /api/pr-question/metadata
 *
 * PR-Linked Q&A — Phase 3, Step 1→2. Takes a raw PR URL, validates it,
 * fetches normalized metadata from GitHub (server-side — GITHUB_TOKEN never
 * reaches the client), and returns a small diff preview (first 50 lines)
 * for Step 2. Doesn't persist anything — the full diff fetch/store only
 * happens after the question is actually created (see FetchPrDiffProcessor).
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { parsePrUrl, toCanonicalPrUrl, fetchPrMetadata, fetchPrDiff } from "@/lib/github";
import { GithubApiError } from "@/lib/github/types";

const DIFF_PREVIEW_LINES = 50;

// Same shape as the question POST rate limit — this hits the GitHub API
// directly so it needs its own, tighter ceiling.
const METADATA_RATE_LIMIT = 10;
const METADATA_WINDOW_MS = 10 * 60_000;

export async function POST(request: NextRequest) {
    let requesterId: string;
    try {
        requesterId = await getAuthenticatedUserId();
    } catch (authError) {
        if (authError instanceof Response) return authError;
        return unauthorizedResponse("Authentication required");
    }

    const rl = await rateLimit({
        key: `pr-question-metadata:${requesterId}`,
        limit: METADATA_RATE_LIMIT,
        windowMs: METADATA_WINDOW_MS,
    });
    const rlHeaders = rateLimitHeaders(rl, METADATA_RATE_LIMIT);
    if (!rl.success) {
        return NextResponse.json(
            { error: "Too many PR lookups. Please slow down." },
            { status: 429, headers: rlHeaders }
        );
    }

    let prUrl: string;
    try {
        ({ prUrl } = await request.json());
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400, headers: rlHeaders });
    }

    let parsed: ReturnType<typeof parsePrUrl>;
    try {
        parsed = parsePrUrl(prUrl);
    } catch (error) {
        if (error instanceof GithubApiError) {
            return NextResponse.json({ error: error.message, code: error.reason }, { status: 400, headers: rlHeaders });
        }
        return NextResponse.json({ error: "Invalid PR URL" }, { status: 400, headers: rlHeaders });
    }

    const { owner, repoName, prNumber } = parsed;

    try {
        const metadata = await fetchPrMetadata(owner, repoName, prNumber);

        // Diff preview is best-effort — a huge/inaccessible diff shouldn't
        // block the metadata step from advancing; the full diff is fetched
        // for real, async, once the question is created.
        let diffPreviewLines: string[] = [];
        try {
            const diff = await fetchPrDiff(owner, repoName, prNumber);
            diffPreviewLines = diff.split("\n").slice(0, DIFF_PREVIEW_LINES);
        } catch {
            diffPreviewLines = [];
        }

        return NextResponse.json(
            {
                data: {
                    owner,
                    repoName,
                    prNumber,
                    prUrl: toCanonicalPrUrl(parsed),
                    ...metadata,
                    diffPreviewLines,
                },
            },
            { status: 200, headers: rlHeaders }
        );
    } catch (error) {
        if (error instanceof GithubApiError) {
            const statusByCode: Record<string, number> = {
                not_found: 404,
                forbidden: 403,
                rate_limited: 429,
                too_large: 413,
                network_error: 502,
                invalid_url: 400,
            };
            return NextResponse.json(
                { error: error.message, code: error.reason },
                { status: statusByCode[error.reason] ?? 502, headers: rlHeaders }
            );
        }
        return NextResponse.json(
            { error: "Something went wrong fetching this PR. Please try again." },
            { status: 500, headers: rlHeaders }
        );
    }
}
