import {
    questionCollection,
    db,
    questionAttachmentBucket,
    answerCollection,
    voteCollection,
    commentCollection,
} from "@/models/name";
import { databases, storage, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { getAuthenticatedUserId, forbiddenResponse, unauthorizedResponse } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sanitizeMarkdownSource, sanitizeTitleSource } from "@/lib/sanitize";
import { revalidateQuestionCaches } from "@/lib/cache-invalidation";
import { listAllDocuments } from "@/lib/appwrite-pagination";

// Rate limit: 3 questions per user per 10 minutes
const QUESTION_RATE_LIMIT = 3;
const QUESTION_WINDOW_MS = 10 * 60_000;

export async function POST(request: NextRequest) {
    try {
        const requesterId = await getAuthenticatedUserId();

        // Rate limit per authenticated user
        const rl = await rateLimit({
            key: `question:${requesterId}`,
            limit: QUESTION_RATE_LIMIT,
            windowMs: QUESTION_WINDOW_MS,
        });
        const rlHeaders = rateLimitHeaders(rl, QUESTION_RATE_LIMIT);

        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many questions posted. Please slow down." },
                { status: 429, headers: rlHeaders }
            );
        }

        const { title, content, authorId, tags, attachmentId } = await request.json();

        if (authorId !== requesterId) {
            return forbiddenResponse("authorId does not match authenticated user");
        }

        // Sanitize user-supplied markdown content before persisting
        const sanitizedTitle = sanitizeTitleSource(title ?? "").slice(0, 100);
        const sanitizedContent = sanitizeMarkdownSource(content ?? "");

        if (sanitizedTitle.length < 15) {
            return NextResponse.json(
                { error: "Title must be at least 15 characters" },
                { status: 400, headers: rlHeaders }
            );
        }
        if (sanitizedContent.length < 30) {
            return NextResponse.json(
                { error: "Body must be at least 30 characters" },
                { status: 400, headers: rlHeaders }
            );
        }

        const docData: Record<string, unknown> = {
            title: sanitizedTitle,
            content: sanitizedContent,
            authorId,
            tags,
        };
        if (attachmentId) docData.attachmentId = attachmentId;

        const response = await databases.createDocument(
            db,
            questionCollection,
            ID.unique(),
            docData
        );
        await revalidateQuestionCaches(response.$id, [sanitizedTitle]);

        return NextResponse.json(response, { status: 201, headers: rlHeaders });
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error creating question" },
            { status: e?.status || e?.code || 500 }
        );
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const requesterId = await getAuthenticatedUserId();

        const { questionId, title, content, tags, attachmentId, oldAttachmentId } =
            await request.json();

        if (!questionId) {
            return NextResponse.json({ error: "questionId is required" }, { status: 400 });
        }

        const question = await databases.getDocument(db, questionCollection, questionId);
        if (question.authorId !== requesterId) {
            return forbiddenResponse("You are not the author of this question");
        }

        // Sanitize on update too
        const sanitizedTitle = sanitizeTitleSource(title ?? "").slice(0, 100);
        const sanitizedContent = sanitizeMarkdownSource(content ?? "");

        const docData: Record<string, unknown> = {
            title: sanitizedTitle,
            content: sanitizedContent,
            tags,
        };

        if (attachmentId && oldAttachmentId && oldAttachmentId !== attachmentId) {
            docData.attachmentId = attachmentId;
        } else if (attachmentId) {
            docData.attachmentId = attachmentId === "none" ? null : attachmentId;
        }

        const response = await databases.updateDocument(
            db,
            questionCollection,
            questionId,
            docData
        );
        await revalidateQuestionCaches(questionId, [
            question.title as string,
            sanitizedTitle,
        ]);

        if (oldAttachmentId && oldAttachmentId !== attachmentId) {
            try {
                await storage.deleteFile(questionAttachmentBucket, oldAttachmentId);
            } catch {
                // Old file may already be gone; non-fatal after the document update succeeded.
            }
        }

        return NextResponse.json(response, { status: 200 });
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error updating question" },
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

    let questionId: string | undefined;

    try {
        ({ questionId } = await request.json());
    } catch {
        return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!questionId) {
        return NextResponse.json({ error: "questionId is required" }, { status: 400 });
    }

    let question: Awaited<ReturnType<typeof databases.getDocument>>;
    try {
        question = await databases.getDocument(db, questionCollection, questionId);
    } catch {
        return NextResponse.json(
            { data: { $id: questionId }, message: "Question not found or already deleted" },
            { status: 200 }
        );
    }

    if (question.authorId !== requesterId) {
        return forbiddenResponse("You are not the author of this question");
    }

    const [answers, questionVotes, questionComments] = await Promise.all([
        listAllDocuments<any>(answerCollection, [
            Query.equal("questionId", questionId),
        ]),
        listAllDocuments<any>(voteCollection, [
            Query.equal("type", "question"),
            Query.equal("typeId", questionId),
        ]),
        listAllDocuments<any>(commentCollection, [
            Query.equal("type", "question"),
            Query.equal("typeId", questionId),
        ]),
    ]);

    const perAnswerData = await Promise.all(
        answers.documents.map(async (answer) => {
            const [answerVotes, answerComments] = await Promise.all([
                listAllDocuments<any>(voteCollection, [
                    Query.equal("type", "answer"),
                    Query.equal("typeId", answer.$id),
                ]),
                listAllDocuments<any>(commentCollection, [
                    Query.equal("type", "answer"),
                    Query.equal("typeId", answer.$id),
                ]),
            ]);
            return { answer, answerVotes, answerComments };
        })
    );

    const phaseAResults = await Promise.allSettled(
        perAnswerData.flatMap(({ answerVotes, answerComments }) => [
            ...answerVotes.documents.map((v) =>
                databases.deleteDocument(db, voteCollection, v.$id)
            ),
            ...answerComments.documents.map((c) =>
                databases.deleteDocument(db, commentCollection, c.$id)
            ),
        ])
    );
    logSettledFailures("phase-A (answer votes/comments)", questionId, phaseAResults);

    const phaseBResults = await Promise.allSettled(
        perAnswerData.map(({ answer }) =>
            databases.deleteDocument(db, answerCollection, answer.$id)
        )
    );
    logSettledFailures("phase-B (answers)", questionId, phaseBResults);

    const phaseCResults = await Promise.allSettled([
        ...questionVotes.documents.map((v) =>
            databases.deleteDocument(db, voteCollection, v.$id)
        ),
        ...questionComments.documents.map((c) =>
            databases.deleteDocument(db, commentCollection, c.$id)
        ),
    ]);
    logSettledFailures("phase-C (question votes/comments)", questionId, phaseCResults);

    if (question.attachmentId && question.attachmentId !== "none") {
        try {
            await storage.deleteFile(questionAttachmentBucket, question.attachmentId as string);
        } catch {
            // Already deleted or never uploaded — ignore.
        }
    }

    try {
        await databases.deleteDocument(db, questionCollection, questionId);
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Failed to delete question document" },
            { status: 500 }
        );
    }
    await revalidateQuestionCaches(questionId, [question.title as string]);

    const upvoteCount = questionVotes.documents.filter(
        (v) => v.voteStatus === "upvoted"
    ).length;
    const downvoteCount = questionVotes.documents.filter(
        (v) => v.voteStatus === "downvoted"
    ).length;
    const netQuestionReputation = upvoteCount - downvoteCount;

    const answerAuthorIds = Array.from(
        new Set(answers.documents.map((a) => a.authorId as string))
    );

    const allAuthorIds = Array.from(
        new Set([
            ...(netQuestionReputation !== 0 ? [question.authorId as string] : []),
            ...answerAuthorIds,
        ])
    );

    const prefsById = new Map<string, number>();
    await Promise.allSettled(
        allAuthorIds.map(async (id) => {
            try {
                const prefs = await users.getPrefs<UserPrefs>(id);
                prefsById.set(id, Number(prefs.reputation ?? 0));
            } catch {
                prefsById.set(id, 0);
            }
        })
    );

    const reputationResults = await Promise.allSettled([
        ...(netQuestionReputation !== 0
            ? [
                  users.updatePrefs<UserPrefs>(question.authorId as string, {
                      reputation:
                          (prefsById.get(question.authorId as string) ?? 0) -
                          netQuestionReputation,
                  }),
              ]
            : []),
        ...answerAuthorIds.map((id) =>
            users.updatePrefs<UserPrefs>(id, {
                reputation: (prefsById.get(id) ?? 0) - 1,
            })
        ),
    ]);
    logSettledFailures("phase-E (reputation)", questionId, reputationResults);

    return NextResponse.json(
        { data: { $id: questionId }, message: "Question deleted" },
        { status: 200 }
    );
}

function logSettledFailures(
    phase: string,
    questionId: string,
    results: PromiseSettledResult<unknown>[]
) {
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failures.length === 0) return;
    console.error(
        `[question/DELETE] ${phase} — ${failures.length} failure(s) for questionId=${questionId}`,
        failures.map((f) => f.reason?.message ?? f.reason)
    );
}
