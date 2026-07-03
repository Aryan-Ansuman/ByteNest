import { NextRequest, NextResponse } from "next/server";
import { Query } from "node-appwrite";
import { db, notificationsCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { getAuthenticatedUserId } from "@/lib/auth";

const LIST_LIMIT = 30;

export async function GET(request: NextRequest) {
    try {
        const userId = await getAuthenticatedUserId();

        const [recent, unread] = await Promise.all([
            databases.listDocuments(db, notificationsCollection, [
                Query.equal("userId", userId),
                Query.orderDesc("createdAt"),
                Query.limit(LIST_LIMIT),
            ]),
            databases.listDocuments(db, notificationsCollection, [
                Query.equal("userId", userId),
                Query.isNull("readAt"),
                Query.limit(1), // only need the total, not the documents
            ]),
        ]);

        const notifications = recent.documents.map((doc) => ({
            $id: doc.$id,
            type: doc.type,
            payload: safeParsePayload(doc.payload as string),
            readAt: doc.readAt as string | null,
            createdAt: doc.createdAt as string,
        }));

        return NextResponse.json({
            data: {
                notifications,
                unreadCount: unread.total,
            },
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error fetching notifications" },
            { status: error?.status || error?.code || 500 }
        );
    }
}

function safeParsePayload(raw: string): Record<string, unknown> {
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}
