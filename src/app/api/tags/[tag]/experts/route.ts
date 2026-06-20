// Phase 4 — Step 4.3

import { db, tagExpertRegistryCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(
    request: NextRequest,
    { params }: { params: { tag: string } }
) {
    try {
        const tag = decodeURIComponent(params.tag ?? "").trim();
        if (!tag) {
            return NextResponse.json({ error: "tag is required" }, { status: 400 });
        }

        const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
        const limit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_LIMIT)
            : DEFAULT_LIMIT;

        const registry = await databases.listDocuments(db, tagExpertRegistryCollection, [
            Query.equal("tag", tag),
            Query.orderAsc("rank"),
            Query.limit(limit),
        ]);

        const builtAt = (registry.documents[0]?.builtAt as string) ?? null;

        const experts = registry.documents.map((doc) => ({
            userId: doc.userId as string,
            userName: (doc.userName as string) ?? null,
            compositeScore: Number(doc.compositeScore ?? 0),
            tier: doc.tier as string,
            rank: Number(doc.rank ?? 0),
        }));

        return NextResponse.json(
            { data: { tag, builtAt, experts } },
            {
                status: 200,
                headers: {
                    // Registry rebuilds hourly (Phase 6) — safe to cache generously.
                    "Cache-Control": "public, max-age=900, stale-while-revalidate=1800",
                },
            }
        );
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error fetching tag experts" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
