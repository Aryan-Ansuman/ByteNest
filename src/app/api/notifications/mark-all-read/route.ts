import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { db, notificationsCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { getAuthenticatedUserId } from "@/lib/auth";
import { listAllDocuments } from "@/lib/appwrite-pagination";

export async function POST(request: NextRequest) {
    try {
        const userId = await getAuthenticatedUserId();

        const { documents: unread } = await listAllDocuments(notificationsCollection, [
            Query.equal("userId", userId),
            Query.isNull("readAt"),
            Query.select(["$id"]),
        ]);

        const now = new Date().toISOString();
        await Promise.all(
            unread.map((doc) =>
                databases
                    .updateDocument(db, notificationsCollection, doc.$id, { readAt: now })
                    .catch(() => null)
            )
        );

        return NextResponse.json({ data: { markedCount: unread.length } });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error marking notifications as read" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
