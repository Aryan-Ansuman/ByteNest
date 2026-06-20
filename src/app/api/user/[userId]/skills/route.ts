// Phase 4 — Step 4.2, 4.4, 4.5

import { db, userSkillScoresCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { getOptionalAuthenticatedUserId } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";

export const dynamic = "force-dynamic";

// Hard cap on tags returned per profile to keep the payload bounded even
// for power users who have activity across many technologies.
const MAX_TAGS = 100;
const PAGE_SIZE = 100;

export async function GET(
    request: NextRequest,
    { params }: { params: { userId: string } }
) {
    try {
        const userId = params.userId;
        if (!userId) {
            return NextResponse.json({ error: "userId is required" }, { status: 400 });
        }

        const requesterId = await getOptionalAuthenticatedUserId();
        const isOwner = requesterId !== null && requesterId === userId;

        const documents: any[] = [];
        let cursor: string | undefined;

        for (;;) {
            const page = await databases.listDocuments(db, userSkillScoresCollection, [
                Query.equal("userId", userId),
                Query.orderDesc("compositeScore"),
                Query.limit(PAGE_SIZE),
                ...(cursor ? [Query.cursorAfter(cursor)] : []),
            ]);

            documents.push(...page.documents);

            if (
                page.documents.length < PAGE_SIZE ||
                documents.length >= page.total ||
                documents.length >= MAX_TAGS
            ) {
                break;
            }
            cursor = page.documents[page.documents.length - 1].$id;
        }

        const trimmed = documents.slice(0, MAX_TAGS);

        const skills = trimmed.map((doc) => {
            const base = {
                tag: doc.tag as string,
                compositeScore: Number(doc.compositeScore ?? 0),
                tier: doc.tier as string,
                trendDirection: doc.trendDirection as string,
            };

            if (!isOwner) return base;

            return {
                ...base,
                answerQualityScore: Number(doc.answerQualityScore ?? 0),
                questionQualityScore: Number(doc.questionQualityScore ?? 0),
                temporalConsistencyScore: Number(doc.temporalConsistencyScore ?? 0),
                peerValidationScore: Number(doc.peerValidationScore ?? 0),
                scoreSevenDaysAgo: Number(doc.scoreSevenDaysAgo ?? 0),
                totalAnswers: Number(doc.totalAnswers ?? 0),
                acceptedAnswers: Number(doc.acceptedAnswers ?? 0),
                totalQuestions: Number(doc.totalQuestions ?? 0),
                totalUpvotesReceived: Number(doc.totalUpvotesReceived ?? 0),
                lastCalculatedAt: (doc.lastCalculatedAt as string) ?? null,
                lastActivityAt: (doc.lastActivityAt as string) ?? null,
            };
        });

        return NextResponse.json(
            { data: { userId, isOwner, totalTags: skills.length, skills } },
            {
                status: 200,
                headers: {
                    "Cache-Control": isOwner
                        ? "private, max-age=300"
                        : "public, max-age=300, stale-while-revalidate=600",
                },
            }
        );
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error fetching skill profile" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
