import { NextRequest, NextResponse } from "next/server";
import { db, notificationsCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { getAuthenticatedUserId, forbiddenResponse } from "@/lib/auth";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id: notificationId } = await params;
        const userId = await getAuthenticatedUserId();

        const notification = await databases
            .getDocument(db, notificationsCollection, notificationId)
            .catch(() => null);

        if (!notification) {
            return NextResponse.json({ error: "Notification not found" }, { status: 404 });
        }
        if (notification.userId !== userId) {
            return forbiddenResponse("You can't modify another user's notification");
        }

        if (!notification.readAt) {
            await databases.updateDocument(db, notificationsCollection, notificationId, {
                readAt: new Date().toISOString(),
            });
        }

        return NextResponse.json({ data: { notificationId, readAt: notification.readAt ?? new Date().toISOString() } });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Error marking notification as read" },
            { status: error?.status || error?.code || 500 }
        );
    }
}
