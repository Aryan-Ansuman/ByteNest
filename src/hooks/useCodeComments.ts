"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { client as realtime } from "@/models/client/config";
import { db as databaseId, codeCommentsCollection } from "@/models/name";
import { apiFetch } from "@/lib/api-fetch";
import type { CodeComment } from "@/types/rooms";

export interface PositionedComment extends CodeComment {
    /** Recomputed every time the doc changes — never trust lineNumberAtCreate after mount */
    currentLine: number;
}

/**
 * Manages code review comments for one session.
 *
 * The durable anchor for a comment is a Yjs character OFFSET into the
 * file's Y.Text, not a line number. As collaborators type above/below the
 * comment, line numbers shift but the offset (and therefore which character
 * the comment is "attached to") stays correct. We recompute line numbers by
 * walking the live Y.Text content on every doc update — the same approach
 * VS Code Live Share uses for anchoring comments in a CRDT document.
 */
export function useCodeComments(
    roomId: string,
    sessionId: string,
    ydoc: Y.Doc | null
) {
    const [comments, setComments] = useState<CodeComment[]>([]);
    const [positioned, setPositioned] = useState<Record<string, PositionedComment[]>>({});
    const [loading, setLoading] = useState(true);

    const commentsRef = useRef<CodeComment[]>([]);
    commentsRef.current = comments;

    // ── Recompute line numbers for all comments from the live ydoc ─────────
    const recalculate = useCallback(() => {
        if (!ydoc) return;

        const byFile: Record<string, PositionedComment[]> = {};

        for (const c of commentsRef.current) {
            let line = c.lineNumberAtCreate;
            try {
                const ytext = ydoc.getText(c.filename);
                const text = ytext.toString();
                const offset = Math.min(c.anchorOffset, text.length);
                // Count newlines before the anchor offset → 1-indexed line number
                line = text.slice(0, offset).split("\n").length;
            } catch {
                // file may not exist locally yet — fall back to stored line
            }

            if (!byFile[c.filename]) byFile[c.filename] = [];
            byFile[c.filename].push({ ...c, currentLine: line });
        }

        setPositioned(byFile);
    }, [ydoc]);

    // ── Initial fetch ───────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        apiFetch<{ comments: CodeComment[] }>(
            `/api/rooms/${roomId}/session/${sessionId}/comments`
        )
            .then((res) => {
                if (!cancelled) setComments(res.comments);
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [roomId, sessionId]);

    // ── Realtime subscription — keep everyone's comment threads in sync ────
    useEffect(() => {
        const unsub = realtime.subscribe(
            `databases.${databaseId}.collections.${codeCommentsCollection}.documents`,
            (event: any) => {
                const payload = event.payload as CodeComment;
                if (payload.sessionId !== sessionId) return;

                const isCreate = event.events.some((e: string) => e.includes(".create"));
                const isUpdate = event.events.some((e: string) => e.includes(".update"));
                const isDelete = event.events.some((e: string) => e.includes(".delete"));

                setComments((prev) => {
                    if (isDelete) return prev.filter((c) => c.$id !== payload.$id);
                    if (isCreate) {
                        if (prev.some((c) => c.$id === payload.$id)) return prev;
                        return [...prev, payload];
                    }
                    if (isUpdate) {
                        return prev.map((c) => (c.$id === payload.$id ? payload : c));
                    }
                    return prev;
                });
            }
        );
        return () => unsub();
    }, [sessionId]);

    // Recalculate whenever the comment list changes
    useEffect(() => {
        recalculate();
    }, [comments, recalculate]);

    // Recalculate whenever the ydoc content changes (someone typed)
    useEffect(() => {
        if (!ydoc) return;
        const handler = () => recalculate();
        ydoc.on("update", handler);
        return () => ydoc.off("update", handler);
    }, [ydoc, recalculate]);

    // ── Mutations ────────────────────────────────────────────────────────────
    const addComment = useCallback(
        async (filename: string, anchorOffset: number, lineNumberAtCreate: number, body: string, parentId?: string) => {
            const res = await apiFetch<{ comment: CodeComment }>(
                `/api/rooms/${roomId}/session/${sessionId}/comments`,
                {
                    method: "POST",
                    body: JSON.stringify({ filename, anchorOffset, lineNumberAtCreate, body, parentId }),
                }
            );
            // Optimistic add — realtime event will dedupe by $id
            setComments((prev) =>
                prev.some((c) => c.$id === res.comment.$id) ? prev : [...prev, res.comment]
            );
            return res.comment;
        },
        [roomId, sessionId]
    );

    const resolveComment = useCallback(
        async (commentId: string, resolved: boolean) => {
            await apiFetch(`/api/rooms/${roomId}/session/${sessionId}/comments/${commentId}`, {
                method: "PATCH",
                body: JSON.stringify({ action: resolved ? "resolve" : "unresolve" }),
            });
        },
        [roomId, sessionId]
    );

    const deleteComment = useCallback(
        async (commentId: string) => {
            await apiFetch(`/api/rooms/${roomId}/session/${sessionId}/comments/${commentId}`, {
                method: "DELETE",
            });
            setComments((prev) => prev.filter((c) => c.$id !== commentId));
        },
        [roomId, sessionId]
    );

    const getCommentsForFile = useCallback(
        (filename: string): PositionedComment[] => positioned[filename] ?? [],
        [positioned]
    );

    return {
        loading,
        getCommentsForFile,
        addComment,
        resolveComment,
        deleteComment,
    };
}
