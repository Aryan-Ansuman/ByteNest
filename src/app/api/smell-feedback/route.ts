import { NextRequest, NextResponse } from "next/server";
import { db, questionCollection, smellFeedbackCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { ApiValidationError, parseJsonBody, requireString, requireEnum } from "@/lib/api-validation";
import { getAuthenticatedUserId } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { withDistributedLock } from "@/lib/distributed-lock";
import { applyFeedbackToQuestion } from "@/lib/smells/feedback-repository";
import { SMELL_IDS } from "@/lib/smells/catalog";
import { createHash } from "crypto";

const FEEDBACK_RATE_LIMIT = 30;
const FEEDBACK_WINDOW_MS = 60_000;

export async function POST(request: NextRequest) {
    try {
        const body = await parseJsonBody(request);
        const questionId = requireString(body.questionId, "questionId");
        const smellId = requireString(body.smellId, "smellId");
        const verdict = requireEnum(body.verdict, ["correct", "incorrect"] as const, "verdict");

        if (!SMELL_IDS.includes(smellId)) {
            return NextResponse.json({ error: `Unknown smell identifier: ${smellId}` }, { status: 400 });
        }

        const requesterId = await getAuthenticatedUserId();

        const rl = await rateLimit({
            key: `smell-feedback:${requesterId}`,
            limit: FEEDBACK_RATE_LIMIT,
            windowMs: FEEDBACK_WINDOW_MS,
        });
        const rlHeaders = rateLimitHeaders(rl, FEEDBACK_RATE_LIMIT);
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many feedback submissions. Please slow down." },
                { status: 429, headers: rlHeaders }
            );
        }

        return await withDistributedLock(`smell-feedback:${questionId}:${smellId}:${requesterId}`, async () => {
            const question = await databases.getDocument(db, questionCollection, questionId).catch(() => null);
            if (!question) {
                return NextResponse.json({ error: "Question not found" }, { status: 404, headers: rlHeaders });
            }

            const feedbackDocId = feedbackDocumentId(questionId, smellId, requesterId);

            try {
                await databases.createDocument(db, smellFeedbackCollection, feedbackDocId, {
                    questionId,
                    smellId,
                    userId: requesterId,
                    verdict,
                    createdAt: new Date().toISOString(),
                });
            } catch (error: any) {
                if (error?.code === 409) {
                    return NextResponse.json(
                        { error: "You've already given feedback on this smell for this question" },
                        { status: 409, headers: rlHeaders }
                    );
                }
                throw error;
            }

            const { tally, autoRemoved } = await applyFeedbackToQuestion(questionId, smellId);

            return NextResponse.json(
                { data: { smellId, tally, autoRemoved } },
                { status: 201, headers: rlHeaders }
            );
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        if (error instanceof ApiValidationError) {
            return NextResponse.json({ error: error.message }, { status: error.status });
        }
        return NextResponse.json(
            { error: error?.message || "Error submitting smell feedback" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

function feedbackDocumentId(questionId: string, smellId: string, userId: string): string {
    return createHash("sha256")
        .update(`smell-feedback:${questionId}:${smellId}:${userId}`)
        .digest("hex")
        .slice(0, 32);
}
