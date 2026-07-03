import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { db, answerCollection, testRunsCollection } from "@/models/name";
import { databases } from "@/models/server/config";

/**
 * Public read — verification status is shown to anyone viewing the question,
 * not just the answer/question owner. Polled client-side by VerificationBadge
 * while status is pending/processing, and fetched once on-demand when the
 * badge is expanded to show evidence (stdout/stderr).
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const answer = await databases.getDocument(db, answerCollection, params.id, [
            Query.select(["verificationStatus", "verificationScore", "lastVerifiedAt", "questionId"]),
        ]);

        const latestRuns = await databases.listDocuments(db, testRunsCollection, [
            Query.equal("answerId", params.id),
            Query.orderDesc("createdAt"),
            Query.limit(1),
        ]);
        const latestTestRun = latestRuns.documents[0] ?? null;

        return NextResponse.json(
            {
                verificationStatus: answer.verificationStatus ?? "unverified",
                verificationScore: answer.verificationScore ?? null,
                lastVerifiedAt: answer.lastVerifiedAt ?? null,
                latestTestRun: latestTestRun && {
                    status: latestTestRun.status,
                    stdout: latestTestRun.stdout ?? "",
                    stderr: latestTestRun.stderr ?? "",
                    exitCode: latestTestRun.exitCode ?? null,
                    durationMs: latestTestRun.durationMs ?? null,
                    pistonRuntime: latestTestRun.pistonRuntime ?? null,
                    createdAt: latestTestRun.createdAt,
                    completedAt: latestTestRun.completedAt ?? null,
                },
            },
            { status: 200, headers: { "Cache-Control": "no-store" } }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error fetching verification status" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
