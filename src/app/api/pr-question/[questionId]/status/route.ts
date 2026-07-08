/**
 * GET /api/pr-question/[questionId]/status
 *
 * PR-Linked Q&A — Phase 5. Polled every 10s by the diff viewer while
 * `diffFileId` is still null (the FetchPrDiff event hasn't landed yet).
 * Deliberately tiny — just the handful of fields the UI needs to react to,
 * not a full question payload.
 */
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { db, questionCollection, githubWebhookRegistrationsCollection, prQuestionMetadataCollection } from "@/models/name";
import { databases } from "@/models/server/config";

export async function GET(_request: NextRequest, { params }: { params: { questionId: string } }) {
    try {
        const question = await databases.getDocument(db, questionCollection, params.questionId);

        // Fetch the sidecar document for PR metadata
        const metadataQuery = await databases.listDocuments(db, prQuestionMetadataCollection, [
            Query.equal("questionId", params.questionId),
            Query.limit(1)
        ]);

        const metadata = metadataQuery.total > 0 ? metadataQuery.documents[0] : null;

        let webhookRegistrationStatus: "registered" | "failed_no_permission" | "unregistered" = "unregistered";
        const owner = metadata?.prRepoOwner as string | undefined;
        const repoName = metadata?.prRepoName as string | undefined;
        if (owner && repoName) {
            const registration = await databases.listDocuments(db, githubWebhookRegistrationsCollection, [
                Query.equal("repoOwner", owner),
                Query.equal("repoName", repoName),
                Query.limit(1),
            ]);
            if (registration.total > 0) {
                webhookRegistrationStatus = registration.documents[0].webhookRegistrationStatus as
                    | "registered"
                    | "failed_no_permission";
            }
        }

        return NextResponse.json(
            {
                data: {
                    diffFileId: (question.diffFileId as string | null) ?? null,
                    diffFetchedAt: (question.diffFetchedAt as string | null) ?? null,
                    prStatus: (metadata?.prStatus as string | null) ?? null,
                    prMergedAt: (metadata?.prMergedAt as string | null) ?? null,
                    prClosedAt: (metadata?.prClosedAt as string | null) ?? null,
                    activityAt: (question.activityAt as string | null) ?? question.$updatedAt,
                    webhookRegistrationStatus,
                },
            },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Question not found" },
            { status: error?.code === 404 ? 404 : 500 }
        );
    }
}
