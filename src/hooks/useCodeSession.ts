"use client";

import { useEffect, useState } from "react";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { databases, client as realtime } from "@/models/client/config";
import {
    db as databaseId,
    collabMessagesCollection,
    codeSessionsCollection,
} from "@/models/name";
import { AppwriteProvider } from "@/lib/yjs/AppwriteProvider";
import { uint8ToBase64, base64ToUint8, debounce } from "@/lib/yjs/utils";
import { useRoomStore } from "@/store/roomStore";
import type { CodeSession } from "@/types/rooms";

export const CURSOR_COLORS: Record<string, string> = {
    indigo: "#6366f1",
    violet: "#8b5cf6",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#f43f5e",
    cyan: "#06b6d4",
};

export function useCodeSession(roomId: string, session: CodeSession | null) {
    const [ydoc, setYdoc] = useState<Y.Doc | null>(null);
    const [awareness, setAwareness] = useState<Awareness | null>(null);

    const currentMember = useRoomStore((s) => s.currentMember);
    const setCodeSession = useRoomStore((s) => s.setCodeSession);

    useEffect(() => {
        if (!session || !currentMember) return;

        // 1. Create Y.Doc
        const doc = new Y.Doc();

        // 2. Hydrate from snapshot — late joiners get full current state
        if (session.yjsSnapshotB64) {
            try {
                Y.applyUpdate(doc, base64ToUint8(session.yjsSnapshotB64));
            } catch {
                // snapshot corrupted — start fresh, still usable
            }
        }

        // 3. Create Awareness with user info for cursor display
        const aw = new Awareness(doc);
        aw.setLocalStateField("user", {
            name: currentMember.displayName,
            color: CURSOR_COLORS[currentMember.avatarColor] ?? "#6366f1",
        });

        // 4. Create provider — starts realtime relay subscriptions
        const provider = new AppwriteProvider({
            doc,
            awareness: aw,
            sessionId: session.$id,
            roomId,
            senderId: currentMember.userId,
            databases,
            realtime,
            databaseId,
            collectionId: collabMessagesCollection,
        });

        // 5. Debounced snapshot save every 5 seconds on any update
        const saveSnapshot = debounce(async (d: Y.Doc, sid: string) => {
            try {
                const state = Y.encodeStateAsUpdate(d);
                await fetch(`/api/rooms/${roomId}/session/${sid}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "snapshot",
                        yjsSnapshotB64: uint8ToBase64(state),
                    }),
                });
            } catch {
                // best effort
            }
        }, 5000);

        doc.on("update", () => saveSnapshot(doc, session.$id));

        // 6. Subscribe to session document for file list + viewOnly changes
        //    This fires when host adds a file or toggles view-only
        const unsubSession = realtime.subscribe(
            `databases.${databaseId}.collections.${codeSessionsCollection}.documents.${session.$id}`,
            (event: any) => {
                const payload = event.payload as CodeSession;
                const isUpdate = event.events.some((e: string) =>
                    e.includes(".update")
                );
                if (isUpdate) setCodeSession(payload);
            }
        );

        // 7. Expose to component
        setYdoc(doc);
        setAwareness(aw);

        return () => {
            unsubSession();
            provider.destroy();
            aw.destroy();
            doc.destroy();
            setYdoc(null);
            setAwareness(null);
        };
    }, [session?.$id, currentMember?.userId]);

    return { ydoc, awareness };
}
