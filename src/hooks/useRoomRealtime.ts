"use client";

import { useEffect, useRef } from "react";
import { client, databases } from "@/models/client/config";
import { db, roomMessagesCollection, roomMembersCollection, discussionRoomsCollection, typingIndicatorsCollection } from "@/models/name";
import { useRoomStore } from "@/store/roomStore";
import type { RoomMessage, RoomMember, DiscussionRoom } from "@/types/rooms";
import { Query } from "appwrite";
import { apiFetch } from "@/lib/api-fetch";

export function useRoomRealtime(roomId: string) {
    const prevCodeSessionId = useRef<string | null | undefined>(undefined);

    const addMessage = useRoomStore((s) => s.addMessage);
    const updateMessage = useRoomStore((s) => s.updateMessage);
    const deleteMessage = useRoomStore((s) => s.deleteMessage);
    const replaceTempMessage = useRoomStore((s) => s.replaceTempMessage);
    const upsertMember = useRoomStore((s) => s.upsertMember);
    const removeMember = useRoomStore((s) => s.removeMember);
    const updateRoom = useRoomStore((s) => s.updateRoom);
    const setCodeSession = useRoomStore((s) => s.setCodeSession);
    const setTypingUsers = useRoomStore((s) => s.setTypingUsers);

    useEffect(() => {
        if (!roomId) return;

        // ── Subscription 1: room_messages ────────────────────────────────
        const unsubMessages = client.subscribe(
            `databases.${db}.collections.${roomMessagesCollection}.documents`,
            (event: any) => {
                const payload = event.payload as RoomMessage;
                if (payload.roomId !== roomId) return;

                const isCreate = event.events.some((e: string) => e.includes(".create"));
                const isUpdate = event.events.some((e: string) => e.includes(".update"));
                const isDelete = event.events.some((e: string) => e.includes(".delete"));

                if (isCreate) {
                    // Replace optimistic temp message if it exists, otherwise add
                    const store = useRoomStore.getState();
                    const tempMsg = store.messages.find(
                        (m) =>
                            m.$id.startsWith("temp-") &&
                            m.authorId === payload.authorId &&
                            m.body === payload.body
                    );
                    if (tempMsg) {
                        replaceTempMessage(tempMsg.$id, payload);
                    } else {
                        addMessage(payload);
                    }
                }

                if (isUpdate) updateMessage(payload);
                if (isDelete) deleteMessage(payload.$id);
            }
        );

        // ── Subscription 2: room_members ─────────────────────────────────
        const unsubMembers = client.subscribe(
            `databases.${db}.collections.${roomMembersCollection}.documents`,
            (event: any) => {
                const payload = event.payload as RoomMember;
                if (payload.roomId !== roomId) return;

                const isCreate = event.events.some((e: string) => e.includes(".create"));
                const isUpdate = event.events.some((e: string) => e.includes(".update"));
                const isDelete = event.events.some((e: string) => e.includes(".delete"));

                if (isCreate || isUpdate) upsertMember(payload);
                if (isDelete) {
                    removeMember(payload.$id);
                    const store = useRoomStore.getState();
                    if (store.currentMember?.userId === payload.userId) {
                        window.location.href = "/rooms";
                    }
                }
            }
        );

        // ── Subscription 3: discussion_rooms ─────────────────────────────
        const unsubRoom = client.subscribe(
            `databases.${db}.collections.${discussionRoomsCollection}.documents`,
            async (event: any) => {
                const payload = event.payload as DiscussionRoom;
                if (payload.$id !== roomId) return;

                const isUpdate = event.events.some((e: string) => e.includes(".update"));
                if (!isUpdate) return;

                updateRoom(payload);

                const newSessionId = payload.activeCodeSessionId ?? null;
                const oldSessionId = prevCodeSessionId.current;

                // Session just started
                if (newSessionId && newSessionId !== oldSessionId) {
                    try {
                        const res = await apiFetch<{ session: any }>(`/api/rooms/${roomId}/session/${newSessionId}`);
                        setCodeSession(res.session);
                    } catch {
                        // best effort
                    }
                }

                // Session ended
                if (!newSessionId && oldSessionId) {
                    setCodeSession(null);
                }

                prevCodeSessionId.current = newSessionId;
            }
        );

        // ── Subscription 4: typing_indicators ────────────────────────────
        const unsubTyping = client.subscribe(
            `databases.${db}.collections.${typingIndicatorsCollection}.documents`,
            async (event: any) => {
                const payload = event.payload as {
                    $id: string;
                    roomId: string;
                    userId: string;
                    displayName: string;
                    $updatedAt: string;
                };

                if (payload.roomId !== roomId) return;

                // Re-query all typing indicators for this room fresh
                // Filter to those updated in last 3.5s, exclude self
                try {
                    const since = new Date(Date.now() - 3500).toISOString();
                    const result = await databases.listDocuments(
                        db,
                        typingIndicatorsCollection,
                        [
                            Query.equal("roomId", roomId),
                            Query.greaterThan("$updatedAt", since),
                            Query.limit(20),
                        ]
                    );

                    const { currentMember } = useRoomStore.getState();
                    const names = result.documents
                        .filter((d) => d.userId !== currentMember?.userId)
                        .map((d) => d.displayName as string);

                    setTypingUsers(names);
                } catch {
                    // best effort
                }
            }
        );

        return () => {
            unsubMessages();
            unsubMembers();
            unsubRoom();
            unsubTyping();
        };
    }, [roomId]);
}
