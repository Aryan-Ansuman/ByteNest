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
import { recomputeQuestionFreshnessIndicator } from "@/lib/decay/question-freshness-indicator";

// Phase 3 — Step 3.4: import the skill trigger
import { triggerSkillRecalculation } from "@/lib/skills/trigger-skill-recalculation";
import { triggerVerification } from "@/lib/tva/trigger-verification";

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

    // A newly-posted answer starts freshnessScore=100/"fresh"; a deleted
    // answer might have been the question's only fresh one. Either way the
    // card's green/amber/grey dot can change — recompute it inline rather
    // than waiting for the nightly job. Best-effort (see helper).
    await recomputeQuestionFreshnessIndicator(questionId);
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

        const { questionId, answer, authorId, solutionCode, solutionLanguage, diffLineRef, diffLineContext, parentAnswerId, condition, branchLabel } = await request.json();

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

        // ─── Branching Answer Trees — Decision 2, 6, 7 ──────────────────
        // Only runs when this answer is a branch (parentAnswerId present).
        // Root answers skip this block entirely and default to depth 0.
        const MAX_DEPTH = 2;
        let branchDepth = 0;
        let resolvedBranchLabel: string | null = null;

        if (typeof parentAnswerId === "string" && parentAnswerId.length > 0) {
            const trimmedCondition = typeof condition === "string" ? condition.trim() : "";
            if (trimmedCondition.length === 0) {
                return NextResponse.json(
                    { error: "condition is required when creating a branch" },
                    { status: 400, headers: rlHeaders }
                );
            }

            let parentAnswer: Awaited<ReturnType<typeof databases.getDocument>>;
            try {
                parentAnswer = await databases.getDocument(db, answerCollection, parentAnswerId);
            } catch {
                return NextResponse.json(
                    { error: "Parent answer not found" },
                    { status: 404, headers: rlHeaders }
                );
            }

            if (parentAnswer.questionId !== questionId) {
                return NextResponse.json(
                    { error: "Branch must belong to the same question as its parent" },
                    { status: 400, headers: rlHeaders }
                );
            }

            const parentDepth = (parentAnswer.branchDepth as number) ?? 0;
            if (parentDepth >= MAX_DEPTH) {
                return NextResponse.json(
                    { error: "Maximum branch depth reached. This answer cannot have further branches." },
                    { status: 400, headers: rlHeaders }
                );
            }

            branchDepth = parentDepth + 1;
            resolvedBranchLabel =
                typeof branchLabel === "string" && branchLabel.trim().length > 0
                    ? branchLabel.trim().slice(0, 100)
                    : trimmedCondition.slice(0, 100);
        }

        const response = await databases.createDocument(db, answerCollection, ID.unique(), {
            content: sanitized,
            authorId,
            questionId,
            isAccepted: false,
            // ─── Branching Answer Trees ──────────────────────────────────
            // Root answers (no parentAnswerId): parentAnswerId/condition/
            // branchLabel stay null, branchDepth stays 0.
            parentAnswerId: typeof parentAnswerId === "string" && parentAnswerId.length > 0 ? parentAnswerId : null,
            condition: branchDepth > 0 ? (condition as string).trim() : null,
            branchDepth,
            branchLabel: branchDepth > 0 ? resolvedBranchLabel : null,
            // TVA — solutionCode is separate from the markdown explanation in
            // `content`. Both nullable: most answers won't carry one.
            ...(typeof solutionCode === "string" && solutionCode.trim().length > 0
                ? { solutionCode, solutionLanguage: solutionLanguage ?? null, verificationStatus: "unverified" }
                : {}),
            // ─── PR-Linked Q&A (Phase 6) ────────────────────────────────
            // Both nullable — non-null only when the answerer clicked a
            // specific diff line (Phase 0, Decision 3). diffLineRef is
            // already JSON-encoded by the client (PrQuestionView).
            ...(typeof diffLineRef === "string" && diffLineRef.length > 0
                ? { diffLineRef, diffLineContext: typeof diffLineContext === "string" ? diffLineContext : null }
                : {}),
        });

        await syncQuestionAnswerMetadata(questionId, response.$createdAt);

        // ─── Branching Answer Trees (Phase 8) ───────────────────────────
        // Denormalized hint for the /questions list — set once, never
        // cleared (Phase 0, Decision 8). Fire-and-forget: it's a UI hint,
        // not a source of truth, so a failed write here should never block
        // or fail the answer creation response.
        if (typeof response.branchDepth === "number" && response.branchDepth > 0) {
            databases
                .updateDocument(db, questionCollection, questionId, { hasBranches: true })
                .catch((error: any) => {
                    const missingAttribute =
                        /attribute not found|unknown attribute|invalid document structure/i.test(
                            error?.message ?? ""
                        ) && /hasBranches/i.test(error?.message ?? "");
                    if (!missingAttribute) {
                        console.error("Failed to set hasBranches on question", questionId, error);
                    }
                });
        }

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

        // ── TVA — queue verification if the question has a test suite ──
        // Awaited (not fire-and-forget) so the response already reflects
        // verificationStatus: "pending" — the UI shows "Verifying…" with
        // zero extra round trips. The actual Piston call happens later via
        // the event_queue worker, off the request path.
        let verificationStatus: string | null = null;
        try {
            verificationStatus = await triggerVerification({
                answerId: response.$id,
                questionId,
                solutionCode,
                triggeredBy: authorId,
            });
        } catch (verifyErr) {
            // Non-fatal — answer creation already succeeded. Worst case the
            // answer stays "unverified" and can be retried manually later.
            console.error("[answer/POST] Failed to trigger verification:", verifyErr);
        }

        return NextResponse.json(
            { ...response, ...(verificationStatus ? { verificationStatus } : {}) },
            { status: 201, headers: rlHeaders }
        );
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

        const {
            answerId,
            questionId,
            accept,
            versionMin,
            versionMax,
            techPackage,
            techEcosystem,
        } = await request.json();

        if (!answerId) {
            return NextResponse.json({ error: "answerId is required" }, { status: 400 });
        }

        const isAcceptRequest = typeof accept === "boolean";
        const versionFieldsProvided =
            versionMin !== undefined ||
            versionMax !== undefined ||
            techPackage !== undefined ||
            techEcosystem !== undefined;

        if (!isAcceptRequest && !versionFieldsProvided) {
            return NextResponse.json(
                { error: "Provide either accept (boolean) or version context fields to update" },
                { status: 400 }
            );
        }

        const targetAnswer = await databases.getDocument(db, answerCollection, answerId);

        // ── Temporal Answer Decay — Phase 4: version context correction ──
        // Authorization is checked independently of whatever else is in
        // the same request — combining `accept` and version fields in one
        // call never lets the accept-path authorization (question author)
        // stand in for the version-edit authorization (answer author), or
        // vice versa. Both are validated up front, before either write happens.
        let versionUpdate: Record<string, unknown> | null = null;
        if (versionFieldsProvided) {
            if (targetAnswer.authorId !== requesterId) {
                return forbiddenResponse("Only the answer author can edit its version context");
            }
            versionUpdate = {
                versionMin: typeof versionMin === "string" ? versionMin.trim() || null : undefined,
                versionMax: typeof versionMax === "string" ? versionMax.trim() || null : undefined,
                techPackage: typeof techPackage === "string" ? techPackage.trim() || null : undefined,
                techEcosystem: techEcosystem === null ? null : isValidEcosystem(techEcosystem) ? techEcosystem : undefined,
            };
            // Strip keys the client didn't actually send (undefined), so a
            // partial update doesn't clobber fields the client omitted.
            versionUpdate = Object.fromEntries(
                Object.entries(versionUpdate).filter(([, v]) => v !== undefined)
            );
        }

        let question: Awaited<ReturnType<typeof databases.getDocument>> | null = null;
        let currentAcceptedAnswerId: string | null = null;
        let nextAcceptedAnswerId: string | null = null;

        if (isAcceptRequest) {
            if (!questionId) {
                return NextResponse.json({ error: "questionId is required when accepting/unaccepting" }, { status: 400 });
            }

            question = await databases.getDocument(db, questionCollection, questionId);
            if (question.isAdr) {
                return NextResponse.json(
                    {
                        error:
                            "ADR questions do not have accepted answers. The community radar chart is the definitive output.",
                    },
                    { status: 400 }
                );
            }
            if (question.authorId !== requesterId) {
                return forbiddenResponse("Only the question author can accept or unaccept answers");
            }
            if (targetAnswer.questionId !== questionId) {
                return NextResponse.json(
                    { error: "Answer does not belong to this question" },
                    { status: 400 }
                );
            }

            currentAcceptedAnswerId =
                typeof question.acceptedAnswerId === "string" && question.acceptedAnswerId
                    ? question.acceptedAnswerId
                    : null;
            nextAcceptedAnswerId =
                accept
                    ? answerId
                    : currentAcceptedAnswerId === answerId
                    ? null
                    : currentAcceptedAnswerId;
        }

        // ── Both authorization checks have now passed independently (or
        // only one path was requested at all) — safe to apply writes. ──

        if (!isAcceptRequest) {
            // Version-only edit — apply and return without touching accept state.
            const updated = await databases.updateDocument(db, answerCollection, answerId, versionUpdate!);
            return NextResponse.json({ data: updated }, { status: 200 });
        }

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
            // versionUpdate is only non-null here if versionFieldsProvided
            // AND its own answer-author check already passed above — never
            // applied on the strength of the accept-path check alone.
            ...(versionUpdate ?? {}),
        });
        await revalidateQuestionCaches(questionId, [question!.title as string]);

        // ─── Branching Answer Trees — Decision 5, 9 ─────────────────────
        // When the accepted node is a branch, walk up its parent chain
        // (max 2 hops: depth-2 -> depth-1 -> depth-0) so the client can
        // highlight the root-to-branch path without a separate fetch.
        let parentChain: Array<{ $id: string; branchDepth: number; condition: string | null }> = [];
        if (accept && updated.parentAnswerId) {
            try {
                const parent = await databases.getDocument(db, answerCollection, updated.parentAnswerId as string);
                parentChain.push({
                    $id: parent.$id,
                    branchDepth: parent.branchDepth as number,
                    condition: (parent.condition as string) ?? null,
                });
                if (parent.parentAnswerId) {
                    const grandparent = await databases.getDocument(db, answerCollection, parent.parentAnswerId as string);
                    parentChain.push({
                        $id: grandparent.$id,
                        branchDepth: grandparent.branchDepth as number,
                        condition: (grandparent.condition as string) ?? null,
                    });
                }
                // Order root-first for the client's path-highlight logic.
                parentChain.reverse();
            } catch {
                // Non-fatal — parent chain is a UI convenience only.
            }
        }

        const tags = (question!.tags as string[]) ?? [];
        if (tags.length > 0) {
            triggerSkillRecalculation({
                userId:           targetAnswer.authorId as string,
                tags,
                triggerType:      "answer_accepted",
                priority:         "high",
                sourceDocumentId: answerId,
            });

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

        return NextResponse.json(
            { data: updated, ...(parentChain.length > 0 ? { parentChain } : {}) },
            { status: 200 }
        );
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Error updating answer" },
            { status: e?.status || e?.code || 500 }
        );
    }
}

function isValidEcosystem(value: unknown): value is "npm" | "pypi" | "crates" | "github" {
    return value === "npm" || value === "pypi" || value === "crates" || value === "github";
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

        // ─── Branching Answer Trees — Decision 6 ────────────────────────
        // Block deletion (not cascade, not orphan-promotion) if this answer
        // has any branch replies. Checked first — no point fetching votes/
        // comments for a deletion we're about to reject.
        const children = await databases.listDocuments(db, answerCollection, [
            Query.equal("parentAnswerId", answerId),
            Query.limit(1),
        ]);
        if (children.total > 0) {
            return NextResponse.json(
                { error: `This answer has ${children.total} branch reply/replies. Delete all branches before deleting the parent.` },
                { status: 400 }
            );
        }

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
