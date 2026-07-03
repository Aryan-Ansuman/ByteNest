import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { db, techPackageMapCollection } from "@/models/name";
import { databases } from "@/models/server/config";

/**
 * Resolves a question's tags to a suggested (techPackage, ecosystem) pair
 * for pre-filling the answer composer's "Version context" section.
 * Decision 2: this is a pre-fill suggestion only, never authoritative —
 * the answerer can always override or clear it.
 *
 * GET /api/tech-package-map?tags=react,typescript,hooks
 * Returns the first tag (in the order given) that has a mapping, or null.
 */
export async function GET(request: NextRequest) {
    try {
        const tagsParam = request.nextUrl.searchParams.get("tags") ?? "";
        const tags = tagsParam
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 10); // question tags are already capped well below this

        if (tags.length === 0) {
            return NextResponse.json({ match: null }, { status: 200 });
        }

        // tag_unique index means at most one row per tag — check tags in
        // the question's own tag order so the first-listed tag wins ties.
        for (const tag of tags) {
            const result = await databases.listDocuments(db, techPackageMapCollection, [
                Query.equal("tag", tag),
                Query.limit(1),
            ]);
            const doc = result.documents[0];
            if (doc) {
                return NextResponse.json(
                    {
                        match: {
                            tag: doc.tag,
                            ecosystem: doc.ecosystem,
                            packageName: doc.packageName,
                        },
                    },
                    { status: 200, headers: { "Cache-Control": "public, max-age=3600" } } // mapping data changes rarely
                );
            }
        }

        return NextResponse.json({ match: null }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json(
            { error: error?.message || "Error resolving tech package map" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
