import { NextRequest, NextResponse } from "next/server";
import { db, answerCollection, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { getAuthenticatedUserId, forbiddenResponse } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { retryVerification, RetryNotAllowedError } from "@/lib/tva/trigger-verification";

// Loose cap — this is a manual, deliberate user action (clicking Retry on a
// visible error badge), not something that can be spammed silently.
const RETRY_RATE_LIMIT = 10;
const RETRY_WINDOW_MS = 10 * 60_000;

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const requesterId = await getAuthenticatedUserId();

        const rl = await rateLimit({
            key: `verify-retry:${requesterId}`,
            limit: RETRY_RATE_LIMIT,
            windowMs: RETRY_WINDOW_MS,
        });
        const rlHeaders = rateLimitHeaders(rl, RETRY_RATE_LIMIT);
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many retries. Please slow down." },
                { status: 429, headers: rlHeaders }
            );
        }

        const answer = await databases.getDocument(db, answerCollection, params.id);
        const question = await databases.getDocument(db, questionCollection, answer.questionId as string);

        const isAnswerOwner = answer.authorId === requesterId;
        const isQuestionAuthor = question.authorId === requesterId;
        if (!isAnswerOwner && !isQuestionAuthor) {
            return forbiddenResponse("Only the answer author or question author can retry verification");
        }

        await retryVerification(params.id, requesterId);

        return NextResponse.json({ verificationStatus: "pending" }, { status: 200, headers: rlHeaders });
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        if (error instanceof RetryNotAllowedError) {
            return NextResponse.json({ error: error.message }, { status: 409 });
        }
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Failed to retry verification" },
            { status: e?.status || e?.code || 500 }
        );
    }
}
