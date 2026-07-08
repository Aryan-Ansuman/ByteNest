/**
 * POST /api/webhooks/github
 *
 * PR-Linked Q&A — Phase 4. GitHub calls this on every `pull_request` event
 * for any repo that has ByteNest's webhook registered (Phase 7). One
 * endpoint for every repo — GitHub's payload carries owner/repo/PR number,
 * so this routes to the right question(s) itself.
 *
 * Ordering in this file is deliberate and security-relevant:
 *   1. Read the raw body, verify the signature. Nothing else happens first.
 *   2. Filter to events we handle.
 *   3. Idempotency guard (atomic create-by-delivery-id).
 *   4. Look up matching question(s), apply the lifecycle transition.
 */
import { NextRequest, NextResponse } from "next/server";
import { ID, Query } from "node-appwrite";
import { db, questionCollection, commentCollection, processedWebhookEventsCollection, prQuestionMetadataCollection, githubWebhookRegistrationsCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { verifyWebhookSignature } from "@/lib/github/webhook";
import { getActiveSecrets } from "@/lib/github/webhook-secret";
import { publishEvent } from "@/lib/events";

export const runtime = "nodejs";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function getRequestIp(request: NextRequest): string {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown"
    );
}

function formatDate(iso: string | null | undefined): string {
    if (!iso) return "an unknown date";
    try {
        return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch {
        return "an unknown date";
    }
}

export async function POST(request: NextRequest) {
    const deliveryId = request.headers.get("x-github-delivery");
    const signature = request.headers.get("x-hub-signature-256");
    const eventType = request.headers.get("x-github-event");
    const ip = getRequestIp(request);

    // ── 1. Signature verification — before anything else touches this request ──
    const rawBodyBuffer = Buffer.from(await request.arrayBuffer());
    // Phase 7: secrets can rotate on a schedule with a 24h overlap window —
    // check the current secret first, then fall back to the previous one
    // only if it's still valid.
    const { current, previous } = await getActiveSecrets();
    const signatureValid =
        verifyWebhookSignature(rawBodyBuffer, signature, current) ||
        (previous ? verifyWebhookSignature(rawBodyBuffer, signature, previous) : false);

    if (!current || !signatureValid) {
        console.error(
            `[webhooks/github] Signature verification failed. ip=${ip} deliveryId=${deliveryId ?? "missing"}`
        );
        return NextResponse.json({ error: "Signature verification failed" }, { status: 403 });
    }

    // ── 2. Only "pull_request" events are handled ──
    if (eventType !== "pull_request") {
        return NextResponse.json({ message: "event ignored" }, { status: 200 });
    }

    if (!deliveryId) {
        // GitHub always sends this header; its absence means something is
        // malformed upstream of us. Reject rather than process without a
        // dedup key.
        console.error(`[webhooks/github] Missing X-GitHub-Delivery header. ip=${ip}`);
        return NextResponse.json({ error: "Missing delivery id" }, { status: 400 });
    }

    let payload: any;
    try {
        payload = JSON.parse(rawBodyBuffer.toString("utf8"));
    } catch {
        return NextResponse.json({ error: "Malformed JSON payload" }, { status: 400 });
    }

    // ── 3. Idempotency — atomic create-by-delivery-id ──
    // Fire-and-forget cleanup of long-expired records; never blocks the request.
    cleanupExpiredWebhookEvents().catch(() => undefined);

    const now = Date.now();
    try {
        await databases.createDocument(db, processedWebhookEventsCollection, deliveryId, {
            deliveryId,
            receivedAt: now,
            expiresAt: now + SEVEN_DAYS_MS,
        });
    } catch (error: any) {
        if (error?.code === 409) {
            return NextResponse.json({ message: "duplicate delivery ignored" }, { status: 200 });
        }
        console.error(`[webhooks/github] Failed to record delivery ${deliveryId}:`, error);
        return NextResponse.json({ error: "Could not record delivery" }, { status: 500 });
    }

    // ── 4. Process — if this throws, un-mark the delivery so a genuine
    // GitHub retry can actually reprocess it instead of being swallowed as
    // a "duplicate".
    try {
        const result = await processPullRequestEvent(payload);
        return NextResponse.json(result.body, { status: 200 });
    } catch (error) {
        await databases
            .deleteDocument(db, processedWebhookEventsCollection, deliveryId)
            .catch(() => undefined);
        console.error(`[webhooks/github] Failed to process delivery ${deliveryId}:`, error);
        return NextResponse.json({ error: "Failed to process webhook" }, { status: 500 });
    }
}

async function cleanupExpiredWebhookEvents(): Promise<void> {
    const expired = await databases.listDocuments(db, processedWebhookEventsCollection, [
        Query.lessThan("expiresAt", Date.now()),
        Query.limit(50),
    ]);
    await Promise.allSettled(
        expired.documents.map((doc) => databases.deleteDocument(db, processedWebhookEventsCollection, doc.$id))
    );
}

async function processPullRequestEvent(payload: any): Promise<{ body: Record<string, unknown> }> {
    const action: string = payload?.action;
    const owner: string | undefined = payload?.repository?.owner?.login;
    const repoName: string | undefined = payload?.repository?.name;
    const prNumber: number | undefined = payload?.pull_request?.number;
    const merged: boolean = Boolean(payload?.pull_request?.merged);
    const mergedAt: string | null = payload?.pull_request?.merged_at ?? null;
    const closedAt: string | null = payload?.pull_request?.closed_at ?? null;
    const baseRef: string = payload?.pull_request?.base?.ref ?? "the base branch";

    if (!owner || !repoName || !prNumber) {
        return { body: { message: "malformed payload — missing repo/PR identifiers" } };
    }

    // Composite index from Phase 1. Multiple questions can legitimately
    // point at the same PR (Phase 3, Decision 2/Step 1) — update all of them.
    const matches = await databases.listDocuments(db, prQuestionMetadataCollection, [
        Query.equal("prRepoOwner", owner),
        Query.equal("prRepoName", repoName),
        Query.equal("prNumber", prNumber),
        Query.limit(100),
    ]);

    if (matches.total === 0) {
        return { body: { message: "no matching question" } };
    }

    // Bookkeeping — lastEventAt is informational only, never blocks processing.
    updateRegistrationLastEventAt(owner, repoName).catch(() => undefined);

    const now = new Date().toISOString();

    switch (action) {
        case "closed": {
            if (merged) {
                const comment = `This PR was merged into ${baseRef} on ${formatDate(mergedAt ?? now)}.`;
                await Promise.all(
                    matches.documents.map((metadataDoc) =>
                        Promise.all([
                            databases.updateDocument(db, prQuestionMetadataCollection, metadataDoc.$id, {
                                prStatus: "merged",
                                prMergedAt: mergedAt ?? now,
                            }),
                            databases.updateDocument(db, questionCollection, metadataDoc.questionId, {
                                activityAt: now,
                            }).catch(() => undefined), // best-effort
                            postSystemComment(metadataDoc.questionId, comment),
                        ])
                    )
                );
                return { body: { message: "pr marked merged", questionIds: matches.documents.map((q) => q.questionId) } };
            }

            const comment = `This PR was closed without merging on ${formatDate(closedAt ?? now)}.`;
            await Promise.all(
                matches.documents.map((metadataDoc) =>
                    Promise.all([
                        databases.updateDocument(db, prQuestionMetadataCollection, metadataDoc.$id, {
                            prStatus: "closed",
                            prClosedAt: closedAt ?? now,
                        }),
                        databases.updateDocument(db, questionCollection, metadataDoc.questionId, {
                            activityAt: now,
                        }).catch(() => undefined), // best-effort
                        postSystemComment(metadataDoc.questionId, comment),
                    ])
                )
            );
            return { body: { message: "pr marked closed", questionIds: matches.documents.map((q) => q.questionId) } };
        }

        case "reopened": {
            await Promise.all(
                matches.documents.map((metadataDoc) =>
                    Promise.all([
                        databases.updateDocument(db, prQuestionMetadataCollection, metadataDoc.$id, {
                            prStatus: "open",
                            prClosedAt: null,
                        }),
                        databases.updateDocument(db, questionCollection, metadataDoc.questionId, {
                            activityAt: now,
                        }).catch(() => undefined), // best-effort
                        postSystemComment(metadataDoc.questionId, "This PR was reopened."),
                    ])
                )
            );
            return { body: { message: "pr marked reopened", questionIds: matches.documents.map((q) => q.questionId) } };
        }

        case "synchronize": {
            // Heavier op — don't do it inline. One RefreshPrDiff event per
            // matching question; the processor overwrites the stored diff.
            await Promise.all(
                matches.documents.map((metadataDoc) =>
                    publishEvent("RefreshPrDiff", {
                        questionId: metadataDoc.questionId,
                        owner,
                        repoName,
                        prNumber,
                    }).catch((err) => {
                        console.error(`[webhooks/github] Failed to publish RefreshPrDiff for ${metadataDoc.questionId}:`, err);
                    })
                )
            );
            return { body: { message: "diff refresh queued", questionIds: matches.documents.map((q) => q.questionId) } };
        }

        default:
            // Any other pull_request action (labeled, assigned, review_requested, ...)
            // — nothing in this feature cares about it yet.
            return { body: { message: "action ignored" } };
    }
}

async function updateRegistrationLastEventAt(owner: string, repoName: string): Promise<void> {
    const registrations = await databases.listDocuments(db, githubWebhookRegistrationsCollection, [
        Query.equal("repoOwner", owner),
        Query.equal("repoName", repoName),
        Query.limit(1),
    ]);
    const registration = registrations.documents[0];
    if (!registration) return;
    await databases.updateDocument(db, githubWebhookRegistrationsCollection, registration.$id, {
        lastEventAt: new Date().toISOString(),
    });
}

async function postSystemComment(questionId: string, content: string): Promise<void> {
    await databases.createDocument(db, commentCollection, ID.unique(), {
        content,
        type: "question",
        typeId: questionId,
        authorId: "system",
    });
}
