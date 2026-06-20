import { answerCollection, db, questionCollection, voteCollection, commentCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { UserPrefs } from "@/store/Auth";
import { getAuthenticatedUserId, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizeMarkdownSource } from "@/lib/sanitize";
import { revalidateQuestionCaches } from "@/lib/cache-invalidation";
import { listAllDocuments } from "@/lib/appwrite-pagination";

// Phase 3 — Step 3.4: import the skill trigger
import { triggerSkillRecalculation } from "@/lib/skills/trigger-skill-recalculation";

// Rate limit: 50 answers per user per 10 minutes
const ANSWER_RATE_LIMIT = 50;
const ANSWER_WINDOW_MS = 10 * 60_000;

async function syncQuestionAnswerMetadata(
    questionId: string,
    activityAt: string,
    clearAcceptedAnswer = false
) {
    const answers = await databases.listDocuments(db, answerCollection, [
        Query.equal("questionId", questionId),
        Query.limit(1),
    ]);

    const metadata: Record<string, unknown> = {
        totalAnswers: answers.total,
        activityAt,
    };
    if (clearAcceptedAnswer) metadata.acceptedAnswerId = null;

    try {
        await databases.updateDocument(db, questionCollection, questionId, metadata);
    } catch (error: any) {
        const missingNewAttribute =
            /attribute not found|unknown attribute|invalid document structure/i.test(
                error?.message ?? ""
            ) && /totalAnswers|activityAt|acceptedAnswerId/i.test(error?.message ?? "");
        if (!missingNewAttribute) throw error;
    }
}

/**
 * Fetch the tags of a question by ID.
 * Returns an empty array if the question cannot be found (non-fatal).
 */
async function getQuestionTags(questionId: string): Promise<string[]> {
    try {
        const question = await databases.getDocument(db, questionCollection, questionId, [
            Query.select(["tags"]),
        ]);
        return (question.tags as string[]) ?? [];
    } catch {
        return [];
    }
}

export async function POST(request: NextRequest) {
    try {
        const requesterId = await getAuthenticatedUserId();

        // Rate limit per authenticated user
        const rl = await rateLimit({
            key: `answer:${requesterId}`,
            limit: ANSWER_RATE_LIMIT,
            windowMs: ANSWER_WINDOW_MS,
        });
        const rlHeaders = rateLimitHeaders(rl, ANSWER_RATE_LIMIT);

        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many answers posted. Please slow down." },
                { status: 429, headers: rlHeaders }
            );
        }

        const { questionId, answer, authorId } = await request.json();

        if (authorId !== requesterId) {
            return forbiddenResponse("authorId does not match authenticated user");
        }

        // Sanitize answer content before storing
        const sanitized = sanitizeMarkdownSource(answer ?? "");
        if (sanitized.length < 10) {
            return NextResponse.json(
                { error: "Answer content is too short (minimum 10 characters)" },
                { status: 400, headers: rlHeaders }
            );
        }

        const response = await databases.createDocument(db, answerCollection, ID.unique(), {
            content: sanitized,
            authorId,
            questionId,
            isAccepted: false,
        });

        await syncQuestionAnswerMetadata(questionId, response.$createdAt);
        await revalidateQuestionCaches(questionId);

        // ── Step 3.4: Trigger skill recalculation on answer posted ──
        const tags = await getQuestionTags(questionId);
        if (tags.length > 0) {
            triggerSkillRecalculation({
                userId:           authorId,
                tags,
                triggerType:      "answer_posted",
                priority:         "normal",
                sourceDocumentId: response.$id,
            });
        }

        return NextResponse.json(response, { status: 201, headers: rlHeaders });
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error creating answer" },
            { status: e?.status || e?.code || 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const requesterId = await getAuthenticatedUserId();

        const { answerId, questionId, accept } = await request.json();

        if (!answerId || !questionId || typeof accept !== "boolean") {
            return NextResponse.json(
                { error: "answerId, questionId, and accept (boolean) are required" },
                { status: 400 }
            );
        }

        const question = await databases.getDocument(db, questionCollection, questionId);
        if (question.authorId !== requesterId) {
            return forbiddenResponse("Only the question author can accept or unaccept answers");
        }

        const targetAnswer = await databases.getDocument(db, answerCollection, answerId);
        if (targetAnswer.questionId !== questionId) {
            return NextResponse.json(
                { error: "Answer does not belong to this question" },
                { status: 400 }
            );
        }

        const currentAcceptedAnswerId =
            typeof question.acceptedAnswerId === "string" && question.acceptedAnswerId
                ? question.acceptedAnswerId
                : null;
        const nextAcceptedAnswerId =
            accept
                ? answerId
                : currentAcceptedAnswerId === answerId
                ? null
                : currentAcceptedAnswerId;

        try {
            await databases.updateDocument(db, questionCollection, questionId, {
                acceptedAnswerId: nextAcceptedAnswerId,
            });
        } catch (error: any) {
            const missingOptionalAttribute =
                /attribute not found/i.test(error?.message ?? "") &&
                /acceptedAnswerId/i.test(error?.message ?? "");
            if (!missingOptionalAttribute) throw error;
        }

        if (accept) {
            const alreadyAccepted = await databases.listDocuments(db, answerCollection, [
                Query.equal("questionId", questionId),
                Query.equal("isAccepted", true),
                Query.limit(5),
            ]);
            await Promise.all(
                alreadyAccepted.documents
                    .filter((a) => a.$id !== answerId)
                    .map((a) =>
                        databases.updateDocument(db, answerCollection, a.$id, {
                            isAccepted: false,
                        })
                    )
            );
        }

        const updated = await databases.updateDocument(db, answerCollection, answerId, {
            isAccepted: nextAcceptedAnswerId === answerId,
        });
        await revalidateQuestionCaches(questionId, [question.title as string]);

        // ── Step 3.4: Trigger skill recalculation on answer accepted — HIGH priority ──
        // Both the answer author (score boost from acceptance) and potentially
        // other answerers (acceptance removed) should be recalculated.
        const tags = (question.tags as string[]) ?? [];
        if (tags.length > 0) {
            // Recalculate the answer author with high priority
            triggerSkillRecalculation({
                userId:           targetAnswer.authorId as string,
                tags,
                triggerType:      "answer_accepted",
                priority:         "high",
                sourceDocumentId: answerId,
            });

            // If a previously accepted answer was de-accepted, also recalculate
            // that author so their score reflects the change
            if (
                currentAcceptedAnswerId &&
                currentAcceptedAnswerId !== answerId &&
                accept
            ) {
                try {
                    const prevAccepted = await databases.getDocument(
                        db,
                        answerCollection,
                        currentAcceptedAnswerId
                    );
                    triggerSkillRecalculation({
                        userId:           prevAccepted.authorId as string,
                        tags,
                        triggerType:      "answer_accepted",
                        priority:         "normal",
                        sourceDocumentId: currentAcceptedAnswerId,
                    });
                } catch {
                    // Non-fatal — previous answer may be deleted
                }
            }
        }

        return NextResponse.json({ data: updated }, { status: 200 });
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error updating answer" },
            { status: e?.status || e?.code || 500 }
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
        const { answerId } = await request.json();

        if (!answerId) {
            return NextResponse.json({ error: "answerId is required" }, { status: 400 });
        }

        let answer: Awaited<ReturnType<typeof databases.getDocument>>;
        try {
            answer = await databases.getDocument(db, answerCollection, answerId);
        } catch {
            return NextResponse.json(
                { data: { $id: answerId }, message: "Answer not found or already deleted" },
                { status: 200 }
            );
        }

        if (answer.authorId !== requesterId) {
            return forbiddenResponse("You are not the author of this answer");
        }

        const authorId   = answer.authorId as string;
        const questionId = answer.questionId as string;

        const [votes, comments, questionTags] = await Promise.all([
            listAllDocuments(voteCollection, [
                Query.equal("type", "answer"),
                Query.equal("typeId", answerId),
            ]),
            listAllDocuments(commentCollection, [
                Query.equal("type", "answer"),
                Query.equal("typeId", answerId),
            ]),
            getQuestionTags(questionId),
        ]);

        try {
            await databases.deleteDocument(db, answerCollection, answerId);
        } catch (deleteError: any) {
            return NextResponse.json(
                { error: deleteError?.message || "Failed to delete answer" },
                { status: deleteError?.status || deleteError?.code || 500 }
            );
        }

        await Promise.allSettled([
            ...votes.documents.map((v) =>
                databases.deleteDocument(db, voteCollection, v.$id)
            ),
            ...comments.documents.map((c) =>
                databases.deleteDocument(db, commentCollection, c.$id)
            ),
        ]);

        await syncQuestionAnswerMetadata(
            questionId,
            new Date().toISOString(),
            Boolean(answer.isAccepted)
        );
        await revalidateQuestionCaches(questionId);

        // ── Step 3.4: Trigger skill recalculation on answer deleted ──
        if (questionTags.length > 0) {
            triggerSkillRecalculation({
                userId:           authorId,
                tags:             questionTags,
                triggerType:      "answer_posted",
                priority:         "normal",
                sourceDocumentId: answerId,
            });
        }

        return NextResponse.json(
            { data: { $id: answerId }, message: "Answer deleted" },
            { status: 200 }
        );
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { message: e?.message || "Error deleting the answer" },
            { status: e?.status || e?.code || 500 }
        );
    }
}
