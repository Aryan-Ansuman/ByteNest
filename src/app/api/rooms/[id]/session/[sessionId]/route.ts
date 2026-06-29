import { NextRequest, NextResponse } from "next/server";
import { ID } from "node-appwrite";
import { databases } from "@/models/server/config";
import { getAuthenticatedUserId } from "@/lib/auth";
import {
    db,
    codeSessionsCollection,
    discussionRoomsCollection,
    roomMessagesCollection,
    collabMessagesCollection,
} from "@/models/name";
import { Query } from "node-appwrite";

export async function GET(
    _req: NextRequest,
    { params }: { params: { id: string; sessionId: string } }
) {
    try {
        await getAuthenticatedUserId();

        const session = await databases.getDocument(
            db,
            codeSessionsCollection,
            params.sessionId
        );
        return NextResponse.json({ session });
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: { id: string; sessionId: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();

        const { id: roomId, sessionId } = params;
        const body = await req.json();
        const { action } = body;

        const session = await databases.getDocument(
            db,
            codeSessionsCollection,
            sessionId
        );

        // Helper: verify host
        const verifyHost = async () => {
            const room = await databases.getDocument(
                db,
                discussionRoomsCollection,
                roomId
            );
            return room.hostId === userId;
        };

        switch (action) {
            // ── Snapshot save (any member, auto every 5s) ──────────────────
            case "snapshot": {
                const updated = await databases.updateDocument(
                    db,
                    codeSessionsCollection,
                    sessionId,
                    { yjsSnapshotB64: body.yjsSnapshotB64 }
                );
                return NextResponse.json({ session: updated });
            }

            // ── Add file (host only) ────────────────────────────────────────
            case "add_file": {
                if (!(await verifyHost())) {
                    return NextResponse.json(
                        { error: "Forbidden" },
                        { status: 403 }
                    );
                }
                const files = JSON.parse(session.files ?? "[]");
                if (files.some((f: any) => f.name === body.name)) {
                    return NextResponse.json(
                        { error: "File already exists" },
                        { status: 409 }
                    );
                }
                files.push({
                    name: body.name,
                    language: body.language ?? "javascript",
                });
                const updated = await databases.updateDocument(
                    db,
                    codeSessionsCollection,
                    sessionId,
                    { files: JSON.stringify(files), activeFile: body.name }
                );
                return NextResponse.json({ session: updated });
            }

            // ── Switch active file ─────────────────────────────────────────
            case "switch_file": {
                const updated = await databases.updateDocument(
                    db,
                    codeSessionsCollection,
                    sessionId,
                    { activeFile: body.filename }
                );
                return NextResponse.json({ session: updated });
            }

            // ── Toggle view-only (host only) ───────────────────────────────
            case "view_only": {
                if (!(await verifyHost())) {
                    return NextResponse.json(
                        { error: "Forbidden" },
                        { status: 403 }
                    );
                }
                const updated = await databases.updateDocument(
                    db,
                    codeSessionsCollection,
                    sessionId,
                    { viewOnly: body.viewOnly }
                );
                return NextResponse.json({ session: updated });
            }

            // ── End session (host only) ────────────────────────────────────
            case "end": {
                if (!(await verifyHost())) {
                    return NextResponse.json(
                        { error: "Forbidden" },
                        { status: 403 }
                    );
                }

                const updateData: Record<string, any> = {
                    status: "ended",
                    endedAt: new Date().toISOString(),
                };
                if (body.yjsSnapshotB64) {
                    updateData.yjsSnapshotB64 = body.yjsSnapshotB64;
                }

                // Fire-and-forget background cleanup of collab_messages
                const deleteCollabMessages = async () => {
                    try {
                        let hasMore = true;
                        while (hasMore) {
                            const msgs = await databases.listDocuments(db, collabMessagesCollection, [
                                Query.equal("sessionId", sessionId),
                                Query.limit(100),
                            ]);
                            if (msgs.documents.length === 0) {
                                hasMore = false;
                            } else {
                                await Promise.all(
                                    msgs.documents.map((doc) =>
                                        databases.deleteDocument(db, collabMessagesCollection, doc.$id)
                                    )
                                );
                            }
                        }
                    } catch (e) {
                        console.error("Failed to cleanup collab messages:", e);
                    }
                };
                
                // Do not await to avoid blocking the response
                deleteCollabMessages();

                await Promise.all([
                    databases.updateDocument(
                        db,
                        codeSessionsCollection,
                        sessionId,
                        updateData
                    ),
                    databases.updateDocument(
                        db,
                        discussionRoomsCollection,
                        roomId,
                        {
                            activeCodeSessionId: null,
                            lastActivityAt: new Date().toISOString(),
                        }
                    ),
                    databases.createDocument(
                        db,
                        roomMessagesCollection,
                        ID.unique(),
                        {
                            roomId,
                            authorId: "system",
                            authorName: "System",
                            authorColor: "indigo",
                            body: "Code session ended",
                            type: "system",
                            reactions: JSON.stringify({}),
                        }
                    ),
                ]);

                return NextResponse.json({ ok: true });
            }

            default:
                return NextResponse.json(
                    { error: "Unknown action" },
                    { status: 400 }
                );
        }
    } catch (error: any) {
        if (error instanceof Response) return error;
        return NextResponse.json(
            { error: error?.message || "Internal server error" },
            { status: 500 }
        );
    }
}
