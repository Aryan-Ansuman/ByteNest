"use client";

import { useCallback, useEffect, useState } from "react";
import * as Y from "yjs";
import { apiFetch } from "@/lib/api-fetch";
import { base64ToUint8 } from "@/lib/yjs/utils";
import type { CodeSession, SessionFile } from "@/types/rooms";

export interface SessionHistoryEntry {
    $id: string;
    $createdAt: string;
    endedAt?: string;
    files: SessionFile[];
}

/**
 * Lists past (ended) code sessions for a room, and can hydrate any one of
 * them into a throwaway Y.Doc to read a specific file's text content —
 * used as the "original" side of the diff view. The throwaway doc is never
 * bound to Monaco for editing and is discarded after reading; it exists
 * purely to decode the CRDT snapshot back into plain text.
 */
export function useSessionHistory(roomId: string) {
    const [sessions, setSessions] = useState<SessionHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        apiFetch<{ sessions: any[] }>(`/api/rooms/${roomId}/session/history`)
            .then((res) => {
                if (cancelled) return;
                const parsed: SessionHistoryEntry[] = res.sessions.map((s) => ({
                    $id: s.$id,
                    $createdAt: s.$createdAt,
                    endedAt: s.endedAt,
                    files: (() => {
                        try {
                            return JSON.parse(s.files ?? "[]");
                        } catch {
                            return [];
                        }
                    })(),
                }));
                setSessions(parsed);
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [roomId]);

    /**
     * Fetches the full session document (including its snapshot) and
     * extracts the text of `filename` from it at the moment that session
     * ended. Returns "" if the file didn't exist in that snapshot.
     */
    const getFileTextFromSession = useCallback(
        async (sessionId: string, filename: string): Promise<string> => {
            const res = await apiFetch<{ session: CodeSession }>(
                `/api/rooms/${roomId}/session/${sessionId}`
            );
            const snapshotB64 = res.session.yjsSnapshotB64;
            if (!snapshotB64) return "";

            // Throwaway doc — decode only, never bound to an editor, never written to.
            const scratchDoc = new Y.Doc();
            try {
                Y.applyUpdate(scratchDoc, base64ToUint8(snapshotB64));
                const text = scratchDoc.getText(filename).toString();
                return text;
            } catch {
                return "";
            } finally {
                scratchDoc.destroy();
            }
        },
        [roomId]
    );

    return { sessions, loading, getFileTextFromSession };
}
