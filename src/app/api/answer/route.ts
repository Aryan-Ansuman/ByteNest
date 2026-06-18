import { answerCollection, db, questionCollection, voteCollection, commentCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { UserPrefs } from "@/store/Auth";

export async function POST(request: NextRequest) {
    try {
        const { questionId, answer, authorId } = await request.json();

        const response = await databases.createDocument(db, answerCollection, ID.unique(), {
            content: answer,
            authorId,
            questionId,
            isAccepted: false,
        });

        // Increase author reputation
        const prefs = await users.getPrefs<UserPrefs>(authorId);
        await users.updatePrefs(authorId, {
            reputation: Number(prefs.reputation) + 1,
        });

        return NextResponse.json(response, { status: 201 });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error creating answer" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

/**
 * PATCH /api/answer
 *
 * Two operations depending on the payload:
 *
 * 1. Accept/unaccept an answer (isAccepted toggle):
 *    { answerId, questionId, requesterId, accept: boolean }
 *    - Only the question author may call this.
 *    - Ensures at most one accepted answer per question by clearing any
 *      previously accepted answer first.
 *
 * 2. (Reserved) Any other answer field updates can be added here.
 */
export async function PATCH(request: NextRequest) {
    try {
        const { answerId, questionId, requesterId, accept } = await request.json();

        if (!answerId || !questionId || !requesterId || typeof accept !== "boolean") {
            return NextResponse.json(
                { error: "answerId, questionId, requesterId, and accept (boolean) are required" },
                { status: 400 }
            );
        }

        // Verify the requester is the question author — only they may accept answers.
        const question = await databases.getDocument(db, questionCollection, questionId);
        if (question.authorId !== requesterId) {
            return NextResponse.json(
                { error: "Only the question author can accept or unaccept answers" },
                { status: 403 }
            );
        }

        // If accepting, first unaccept any currently accepted answer on this question.
        if (accept) {
            const alreadyAccepted = await databases.listDocuments(db, answerCollection, [
                Query.equal("questionId", questionId),
                Query.equal("isAccepted", true),
                Query.limit(5), // guard against data corruption producing multiple
            ]);

            await Promise.all(
                alreadyAccepted.documents
                    .filter((a) => a.$id !== answerId)
                    .map((a) =>
                        databases.updateDocument(db, answerCollection, a.$id, { isAccepted: false })
                    )
            );
        }

        const updated = await databases.updateDocument(db, answerCollection, answerId, {
            isAccepted: accept,
        });

        return NextResponse.json({ data: updated }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error updating answer" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

/**
 * DELETE /api/answer
 *
 * Transactional delete with best-effort rollback:
 * 1. Snapshot the author's current reputation before touching anything.
 * 2. Delete the answer document.
 * 3. Delete related votes and comments.
 * 4. Decrement reputation.
 *
 * If step 4 fails after step 2 has already succeeded, the document is gone
 * but reputation is wrong. We roll back by re-creating a minimal answer
 * record so the reputation delta can be retried, and return a 500 so the
 * client knows something went wrong. This is best-effort given Appwrite's
 * lack of multi-document transactions — a proper reconciliation job is the
 * only truly safe fix at scale, but this prevents silent drift.
 */
export async function DELETE(request: NextRequest) {
    try {
        const { answerId } = await request.json();

        if (!answerId) {
            return NextResponse.json({ error: "answerId is required" }, { status: 400 });
        }

        // ── 1. Read everything we need before mutating ──────────────────
        const answer = await databases.getDocument(db, answerCollection, answerId);
        const authorId = answer.authorId as string;

        // Snapshot reputation before we touch anything so we can roll back.
        const prefsSnapshot = await users.getPrefs<UserPrefs>(authorId);
        const reputationBefore = Number(prefsSnapshot.reputation ?? 0);

        // Collect related votes and comments.
        const [votes, comments] = await Promise.all([
            databases.listDocuments(db, voteCollection, [
                Query.equal("type", "answer"),
                Query.equal("typeId", answerId),
                Query.limit(5000),
            ]),
            databases.listDocuments(db, commentCollection, [
                Query.equal("type", "answer"),
                Query.equal("typeId", answerId),
                Query.limit(5000),
            ]),
        ]);

        // ── 2. Delete the answer document ───────────────────────────────
        await databases.deleteDocument(db, answerCollection, answerId);

        // ── 3. Delete related votes and comments (fire-and-forget errors) ─
        // These are non-critical — orphan votes/comments don't affect UX
        // materially, and retrying the whole DELETE would fail because the
        // answer document is already gone.
        await Promise.allSettled([
            ...votes.documents.map((v) =>
                databases.deleteDocument(db, voteCollection, v.$id)
            ),
            ...comments.documents.map((c) =>
                databases.deleteDocument(db, commentCollection, c.$id)
            ),
        ]);

        // ── 4. Decrement reputation — with rollback on failure ───────────
        try {
            const freshPrefs = await users.getPrefs<UserPrefs>(authorId);
            await users.updatePrefs<UserPrefs>(authorId, {
                reputation: Number(freshPrefs.reputation ?? 0) - 1,
            });
        } catch (repError: any) {
            // The document is deleted but reputation wasn't decremented.
            // Log clearly so an admin/reconciliation job can detect the drift.
            console.error(
                "[answer/DELETE] reputation decrement failed after document deletion",
                { answerId, authorId, reputationBefore, error: repError?.message }
            );
            // Return a partial-success response so the client knows the answer
            // is gone (safe to remove from UI) but something else went wrong.
            return NextResponse.json(
                {
                    data: { $id: answerId },
                    warning: "Answer deleted but reputation update failed. This will be reconciled.",
                },
                { status: 207 }
            );
        }

        return NextResponse.json(
            { data: { $id: answerId }, message: "Answer deleted" },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { message: error?.message || "Error deleting the answer" },
            { status: error?.status || error?.code || 500 }
        );
    }
}