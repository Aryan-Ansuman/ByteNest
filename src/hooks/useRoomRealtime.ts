"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { client } from "@/models/client/config";
import { db, roomMessagesCollection, roomMembersCollection, discussionRoomsCollection, typingIndicatorsCollection } from "@/models/name";
import { useRoomStore } from "@/store/roomStore";
import type { RoomMessage, RoomMember, DiscussionRoom } from "@/types/rooms";
import { apiFetch } from "@/lib/api-fetch";

export function useRoomRealtime(roomId: string) {
    const router = useRouter();
    const prevCodeSessionId = useRef<string | null | undefined>(undefined);
    const typingUsersRef = useRef<
        Map<string, { displayName: string; updatedAt: number }>
    >(new Map());

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

        function publishTypingUsers() {
            const store = useRoomStore.getState();
            const now = Date.now();
            const names: string[] = [];

            for (const [userId, entry] of Array.from(typingUsersRef.current.entries())) {
                if (now - entry.updatedAt > 3500) {
                    typingUsersRef.current.delete(userId);
                    continue;
                }
                if (userId !== store.currentMember?.userId) {
                    names.push(entry.displayName);
                }
            }

            setTypingUsers(names);
        }

        const typingPruneInterval = window.setInterval(publishTypingUsers, 1000);

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
                        toast.error("You were removed from the room");
                        window.setTimeout(() => {
                            router.replace("/rooms?error=kicked");
                        }, 700);
                    }
                }
            }
        );

        // ── Subscription 3: discussion_rooms ─────────────────────────────
        const unsubRoom = client.subscribe(
            `databases.${db}.collections.${discussionRoomsCollection}.documents.${roomId}`,
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
            (event: any) => {
                const payload = event.payload as {
                    $id: string;
                    roomId: string;
                    userId: string;
                    displayName: string;
                    $updatedAt: string;
                };

                if (payload.roomId !== roomId) return;

                const isDelete = event.events.some((e: string) => e.includes(".delete"));
                if (isDelete) {
                    typingUsersRef.current.delete(payload.userId);
                } else {
                    typingUsersRef.current.set(payload.userId, {
                        displayName: payload.displayName,
                        updatedAt: Date.now(),
                    });
                }

                publishTypingUsers();
            }
        );

        return () => {
            window.clearInterval(typingPruneInterval);
            unsubMessages();
            unsubMembers();
            unsubRoom();
            unsubTyping();
            typingUsersRef.current.clear();
            setTypingUsers([]);
        };
    }, [roomId, router]);
}
