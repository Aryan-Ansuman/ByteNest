/**
 * GET /api/question-dynamic?questionId=<id>
 *
 * Returns the dynamic portion of a question page: all answers (with their
 * vote counts, comments, and author info) plus question-level comments.
 *
 * Called client-side by DynamicAnswerSection after the ISR-cached static
 * shell has painted. This route is intentionally NOT cached so votes/answers
 * are always fresh.
 *
 * Response shape:
 * {
 *   answers: { total: number, documents: AnswerDoc[] },
 *   comments: { total: number, documents: CommentDoc[] }
 * }
 */

import {
    answerCollection,
    commentCollection,
    db,
    questionCollection,
} from "@/models/name";
import { databases, users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const questionId = request.nextUrl.searchParams.get("questionId");

        if (!questionId || typeof questionId !== "string") {
            return NextResponse.json(
                { error: "questionId query parameter is required" },
                { status: 400 }
            );
        }

        // ── 1. Fetch answers + question-level comments in parallel ────────
        const [question, answers, comments] = await Promise.all([
            databases.getDocument(db, questionCollection, questionId),
            databases.listDocuments(db, answerCollection, [
                Query.orderDesc("$createdAt"),
                Query.equal("questionId", questionId),
                Query.limit(getAnswerPageSize(request)),
                ...(request.nextUrl.searchParams.get("cursor")
                    ? [Query.cursorAfter(request.nextUrl.searchParams.get("cursor") as string)]
                    : []),
            ]),
            databases.listDocuments(db, commentCollection, [
                Query.equal("type", "question"),
                Query.equal("typeId", questionId),
                Query.orderDesc("$createdAt"),
                Query.limit(500),
            ]),
        ]);

        const storedAcceptedAnswerId =
            typeof question.acceptedAnswerId === "string" && question.acceptedAnswerId
                ? question.acceptedAnswerId
                : null;
        const acceptedAnswerId =
            storedAcceptedAnswerId ??
            answers.documents.find((answer) => Boolean(answer.isAccepted))?.$id ??
            null;
        const answerIds = answers.documents.map((a) => a.$id);
        const nextCursor =
            answers.documents.length > 0
                ? answers.documents[answers.documents.length - 1].$id
                : null;

        // ── 2. Batch-fetch all answer comments in one query ───────────────
        const allAnswerComments =
            answerIds.length > 0
                ? await databases.listDocuments(db, commentCollection, [
                      Query.equal("type", "answer"),
                      Query.equal("typeId", answerIds),
                      Query.orderDesc("$createdAt"),
                      Query.limit(500),
                  ])
                : { documents: [] as any[], total: 0 };

        // ── 3. Deduplicated author fetches ────────────────────────────────
        const authorIds = new Set<string>();
        answers.documents.forEach((a) => authorIds.add(a.authorId as string));
        allAnswerComments.documents.forEach((c) => authorIds.add(c.authorId as string));
        comments.documents.forEach((c) => authorIds.add(c.authorId as string));

        const authorEntries = await Promise.all(
            Array.from(authorIds).map(async (id) => {
                const u = await users.get<UserPrefs>(id).catch(() => null);
                return [
                    id,
                    {
                        $id: u?.$id ?? "deleted",
                        name: u?.name ?? "Deleted User",
                        reputation: u?.prefs?.reputation ?? 0,
                    },
                ] as const;
            })
        );
        const authorById = new Map(authorEntries);

        const toAuthor = (id: string) =>
            authorById.get(id) ?? { $id: "deleted", name: "Deleted User", reputation: 0 };

        // ── 4. Group answer comments by answer ────────────────────────────
        const commentsByAnswer = new Map<string, any[]>();
        for (const c of allAnswerComments.documents) {
            const list = commentsByAnswer.get(c.typeId as string) ?? [];
            list.push({ ...c, author: toAuthor(c.authorId as string) });
            commentsByAnswer.set(c.typeId as string, list);
        }

        // ── 5. Hydrate answers ────────────────────────────────────────────
        const hydratedAnswers = answers.documents.map((answer) => {
            const answerComments = commentsByAnswer.get(answer.$id) ?? [];
            const answerVoteScore = Number(answer.totalVotes ?? 0);

            return {
                $id: answer.$id,
                $createdAt: answer.$createdAt,
                $updatedAt: answer.$updatedAt,
                content: answer.content as string,
                questionId: answer.questionId as string,
                authorId: answer.authorId as string,
                isAccepted: acceptedAnswerId
                    ? answer.$id === acceptedAnswerId
                    : Boolean(answer.isAccepted),
                totalVotes: answerVoteScore,
                author: toAuthor(answer.authorId as string),
                comments: { total: answerComments.length, documents: answerComments },
                upvotesDocuments: { total: 0, documents: [] },
                downvotesDocuments: { total: 0, documents: [] },
            };
        });

        // ── 6. Hydrate question-level comments ────────────────────────────
        const hydratedComments = comments.documents.map((c) => ({
            ...c,
            author: toAuthor(c.authorId as string),
        }));

        return NextResponse.json(
            {
                answers: { total: answers.total, documents: hydratedAnswers },
                comments: { total: comments.total, documents: hydratedComments },
                acceptedAnswerId,
                answerPagination: {
                    total: answers.total,
                    loaded: hydratedAnswers.length,
                    hasMore: hydratedAnswers.length < answers.total,
                    nextCursor,
                },
            },
            {
                status: 200,
                headers: {
                    // Browser: don't cache this at all — it's the "live" payload.
                    // CDN: also no-cache so stale vote counts are never served.
                    "Cache-Control": "no-store",
                },
            }
        );
    } catch (error: any) {
        console.error("[/api/question-dynamic] error:", error?.message ?? error);
        return NextResponse.json(
            { error: error?.message || "Failed to load question data" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

function getAnswerPageSize(request: NextRequest) {
    const requested = Number(request.nextUrl.searchParams.get("limit") ?? 20);
    if (!Number.isFinite(requested)) return 20;
    return Math.min(Math.max(Math.trunc(requested), 1), 50);
}
