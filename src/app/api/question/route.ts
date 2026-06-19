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

export async function POST(request: NextRequest) {
    try {
        const requesterId = await getAuthenticatedUserId();

        const { title, content, authorId, tags, attachmentId } = await request.json();

        // The client sends the user's own ID; verify it matches the session.
        if (authorId !== requesterId) {
            return forbiddenResponse("authorId does not match authenticated user");
        }

        const docData: Record<string, unknown> = { title, content, authorId, tags };
        if (attachmentId) docData.attachmentId = attachmentId;

        const response = await databases.createDocument(
            db,
            questionCollection,
            ID.unique(),
            docData
        );

        return NextResponse.json(response, { status: 201 });
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

        // Ownership check against the live document — not the client's claim.
        const question = await databases.getDocument(db, questionCollection, questionId);
        if (question.authorId !== requesterId) {
            return forbiddenResponse("You are not the author of this question");
        }

        const docData: Record<string, unknown> = { title, content, tags };

        if (attachmentId && oldAttachmentId && oldAttachmentId !== attachmentId) {
            try {
                await storage.deleteFile(questionAttachmentBucket, oldAttachmentId);
            } catch {
                // Old file may already be gone; non-fatal.
            }
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
    // ── 0. Auth — must come before reading the body ──────────────────────
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

    // ── 1. Fetch the question and verify ownership ────────────────────────
    let question: Awaited<ReturnType<typeof databases.getDocument>>;
    try {
        question = await databases.getDocument(db, questionCollection, questionId);
    } catch {
        // Document not found — treat as already deleted (idempotent).
        return NextResponse.json(
            { data: { $id: questionId }, message: "Question not found or already deleted" },
            { status: 200 }
        );
    }

    // Server-side ownership check — never trust the client-supplied authorId.
    if (question.authorId !== requesterId) {
        return forbiddenResponse("You are not the author of this question");
    }

    // ── 2. Collect all dependent documents ───────────────────────────────
    // We fetch everything before mutating so partial failures don't leave us
    // unable to identify what still needs cleanup.
    const [answers, questionVotes, questionComments] = await Promise.all([
        databases.listDocuments(db, answerCollection, [
            Query.equal("questionId", questionId),
            Query.limit(5000),
        ]),
        databases.listDocuments(db, voteCollection, [
            Query.equal("type", "question"),
            Query.equal("typeId", questionId),
            Query.limit(5000),
        ]),
        databases.listDocuments(db, commentCollection, [
            Query.equal("type", "question"),
            Query.equal("typeId", questionId),
            Query.limit(5000),
        ]),
    ]);

    const perAnswerData = await Promise.all(
        answers.documents.map(async (answer) => {
            const [answerVotes, answerComments] = await Promise.all([
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", "answer"),
                    Query.equal("typeId", answer.$id),
                    Query.limit(5000),
                ]),
                databases.listDocuments(db, commentCollection, [
                    Query.equal("type", "answer"),
                    Query.equal("typeId", answer.$id),
                    Query.limit(5000),
                ]),
            ]);
            return { answer, answerVotes, answerComments };
        })
    );

    // ── 3. Delete in dependency order, logging each phase ────────────────
    // Phase A: answer-level votes and comments.
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

    // Phase B: answer documents themselves.
    const phaseBResults = await Promise.allSettled(
        perAnswerData.map(({ answer }) =>
            databases.deleteDocument(db, answerCollection, answer.$id)
        )
    );
    logSettledFailures("phase-B (answers)", questionId, phaseBResults);

    // Phase C: question-level votes and comments.
    const phaseCResults = await Promise.allSettled([
        ...questionVotes.documents.map((v) =>
            databases.deleteDocument(db, voteCollection, v.$id)
        ),
        ...questionComments.documents.map((c) =>
            databases.deleteDocument(db, commentCollection, c.$id)
        ),
    ]);
    logSettledFailures("phase-C (question votes/comments)", questionId, phaseCResults);

    // Phase D: attachment file (non-fatal if already gone).
    if (question.attachmentId && question.attachmentId !== "none") {
        try {
            await storage.deleteFile(questionAttachmentBucket, question.attachmentId as string);
        } catch {
            // Already deleted or never uploaded — ignore.
        }
    }

    // ── 4. Delete the question document itself ────────────────────────────
    // This is the point of no return.  If it fails we haven't lost anything
    // permanent (dependent docs may be gone, but those are cascade data).
    try {
        await databases.deleteDocument(db, questionCollection, questionId);
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Failed to delete question document" },
            { status: 500 }
        );
    }

    // ── 5. Reputation adjustments — best-effort, logged on failure ────────
    // We snapshot all prefs first so the reputation math is based on a
    // consistent read, then apply all writes.  A single prefs-update failure
    // does not roll back the delete (which is already committed), but it is
    // logged so an admin/reconciliation job can detect and fix the drift.
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

    // Collect all unique author IDs that need reputation changes.
    const allAuthorIds = Array.from(
        new Set([
            ...(netQuestionReputation !== 0 ? [question.authorId as string] : []),
            ...answerAuthorIds,
        ])
    );

    // Snapshot all prefs before writing anything.
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

    // Apply reputation deltas.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
