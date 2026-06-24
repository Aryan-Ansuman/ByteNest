"use client";

import { useCallback, useRef } from "react";
import { ID, Query } from "appwrite";
import { databases } from "@/models/client/config";
import { db, typingIndicatorsCollection } from "@/models/name";
import { useRoomStore } from "@/store/roomStore";

const CLEAR_DELAY = 3000;

export function useTypingIndicator(roomId: string) {
    const typingDocId = useRef<string | null>(null);
    const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentMember = useRoomStore.getState().currentMember;

    const startTyping = useCallback(async () => {
        if (!currentMember) return;

        // Reset the clear timer
        if (clearTimer.current) clearTimeout(clearTimer.current);

        clearTimer.current = setTimeout(async () => {
            await stopTyping();
        }, CLEAR_DELAY);

        // If doc exists, just update it (touch $updatedAt)
        if (typingDocId.current) {
            try {
                await databases.updateDocument(
                    db,
                    typingIndicatorsCollection,
                    typingDocId.current,
                    { displayName: currentMember.displayName }
                );
            } catch {
                typingDocId.current = null;
                await createTypingDoc();
            }
            return;
        }

        await createTypingDoc();
    }, [roomId, currentMember]);

    async function createTypingDoc() {
        if (!currentMember) return;
        try {
            // Try to find existing doc first (unique index: roomId + userId)
            const existing = await databases.listDocuments(
                db,
                typingIndicatorsCollection,
                [
                    Query.equal("roomId", roomId),
                    Query.equal("userId", currentMember.userId),
                    Query.limit(1),
                ]
            );

            if (existing.total > 0) {
                typingDocId.current = existing.documents[0].$id;
                await databases.updateDocument(
                    db,
                    typingIndicatorsCollection,
                    typingDocId.current,
                    { displayName: currentMember.displayName }
                );
            } else {
                const doc = await databases.createDocument(
                    db,
                    typingIndicatorsCollection,
                    ID.unique(),
                    {
                        roomId,
                        userId: currentMember.userId,
                        displayName: currentMember.displayName,
                    }
                );
                typingDocId.current = doc.$id;
            }
        } catch {
            // best effort
        }
    }

    const stopTyping = useCallback(async () => {
        if (clearTimer.current) clearTimeout(clearTimer.current);
        if (!typingDocId.current) return;
        try {
            await databases.deleteDocument(
                db,
                typingIndicatorsCollection,
                typingDocId.current
            );
            typingDocId.current = null;
        } catch {
            // best effort
        }
    }, []);

    return { startTyping, stopTyping };
}
