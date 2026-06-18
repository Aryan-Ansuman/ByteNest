import { db, voteCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";

/**
 * GET /api/vote/batch
 *
 * Bulk-fetches the current user's vote status for multiple targets in a
 * single round-trip. Used by QuestionDetailContext to replace the N
 * individual GET /api/vote calls that AnswerCard used to fire (one per
 * answer), collapsing them into one.
 *
 * Query params:
 *   type       — "question" | "answer"
 *   typeIds    — comma-separated list of document IDs
 *   votedById  — the current user's ID
 *
 * Response:
 *   { data: { documents: Array<{ typeId: string; voteStatus: "upvoted" | "downvoted" }> } }
 *
 * Only IDs that have an existing vote document are included in the
 * response array — absent IDs should be treated as "no vote" (null).
 */
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const type = searchParams.get("type");
        const typeIdsRaw = searchParams.get("typeIds");
        const votedById = searchParams.get("votedById");

        if (!type || !typeIdsRaw || !votedById) {
            return NextResponse.json(
                { error: "type, typeIds, and votedById are required" },
                { status: 400 }
            );
        }

        const typeIds = typeIdsRaw
            .split(",")
            .map((id) => id.trim())
            .filter(Boolean);

        if (typeIds.length === 0) {
            return NextResponse.json(
                { data: { documents: [] } },
                { status: 200 }
            );
        }

        // Appwrite supports up to 100 values in a single Query.equal array.
        // Chunk if necessary to stay within the limit.
        const CHUNK_SIZE = 100;
        const chunks: string[][] = [];
        for (let i = 0; i < typeIds.length; i += CHUNK_SIZE) {
            chunks.push(typeIds.slice(i, i + CHUNK_SIZE));
        }

        const chunkResults = await Promise.all(
            chunks.map((chunk) =>
                databases.listDocuments(db, voteCollection, [
                    Query.equal("type", type),
                    Query.equal("typeId", chunk),
                    Query.equal("votedById", votedById),
                    // One vote per user per target — at most one doc per chunk entry.
                    Query.limit(CHUNK_SIZE),
                ])
            )
        );

        const documents = chunkResults.flatMap((result) =>
            result.documents.map((doc) => ({
                typeId: doc.typeId as string,
                voteStatus: doc.voteStatus as "upvoted" | "downvoted",
            }))
        );

        return NextResponse.json(
            { data: { documents } },
            { status: 200 }
        );
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error fetching batch vote statuses" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
