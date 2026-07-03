import { NextRequest, NextResponse } from "next/server";
import { db, answerCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { getAuthenticatedUserId, forbiddenResponse } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { withDistributedLock } from "@/lib/distributed-lock";
import { recomputeAnswerFreshness } from "@/lib/decay/recompute-single-answer";
import { revalidateQuestionCaches } from "@/lib/cache-invalidation";

const STILL_VALID_RATE_LIMIT = 20;
const STILL_VALID_WINDOW_MS = 60_000;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: answerId } = await params;
        if (!answerId) {
            return NextResponse.json({ error: "answerId is required" }, { status: 400 });
        }

        const requesterId = await getAuthenticatedUserId();

        const rl = await rateLimit({
            key: `still-valid:${requesterId}`,
            limit: STILL_VALID_RATE_LIMIT,
            windowMs: STILL_VALID_WINDOW_MS,
        });
        const rlHeaders = rateLimitHeaders(rl, STILL_VALID_RATE_LIMIT);
        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many actions. Please slow down." },
                { status: 429, headers: rlHeaders }
            );
        }

        return await withDistributedLock(`still-valid:${answerId}`, async () => {
            const answer = await databases.getDocument(db, answerCollection, answerId).catch(() => null);
            if (!answer) {
                return NextResponse.json({ error: "Answer not found" }, { status: 404, headers: rlHeaders });
            }

            if (answer.authorId !== requesterId) {
                return forbiddenResponse("Only the answer author can confirm it's still valid");
            }

            // Community staleness votes are cleared only by users retracting
            // their own reports — the author cannot wipe them via this
            // endpoint. This only resets the effective age used by the time
            // multiplier (recomputeAnswerFreshness reads verifiedByAuthorAt
            // and re-anchors ageInMonths to it), so a heavily staleness-voted
            // answer still can't jump back to 100.
            await databases.updateDocument(db, answerCollection, answerId, {
                verifiedByAuthorAt: new Date().toISOString(),
            });

            const result = await recomputeAnswerFreshness(answerId);

            await revalidateQuestionCaches(answer.questionId as string).catch(() => {});

            return NextResponse.json(
                {
                    data: {
                        answerId,
                        verifiedByAuthorAt: new Date().toISOString(),
                        freshnessScore: result?.freshnessScore ?? answer.freshnessScore ?? 100,
                        freshnessLabel: result?.freshnessLabel ?? answer.freshnessLabel ?? "fresh",
                    },
                },
                { status: 200, headers: rlHeaders }
            );
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error confirming answer is still valid" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
