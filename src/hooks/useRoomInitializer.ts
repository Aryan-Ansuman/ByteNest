import { useEffect, useRef } from "react";
import { useRoomStore } from "@/store/roomStore";
import { apiFetch } from "@/lib/api-fetch";
import { account } from "@/models/client/config";
import type { RoomMessage, RoomMember, DiscussionRoom, CodeSession } from "@/types/rooms";

/**
 * Initializes the room on mount (join + fetch data) and leaves on unmount.
 * Uses a ref guard to prevent double-initialization in React strict mode.
 */
export function useRoomInitializer(roomId: string, inviteToken?: string) {
    const store = useRoomStore();
    const initializedRef = useRef(false);
    const jwtRef = useRef<string>("");

    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        let aborted = false;

        async function initialize() {
            store.setInitializing(true);
            store.setInitError(null);

            try {
                // Ensure we have a JWT for the cleanup function later
                try {
                    const result = await account.createJWT();
                    jwtRef.current = result.jwt;
                } catch {
                    // Ignore, apiFetch will handle auth errors
                }

                // 1. Join room (handles fresh join + rejoin)
                const joinData = await apiFetch<{ member: RoomMember; rejoined: boolean }>(
                    `/api/rooms/${roomId}/join`,
                    {
                        method: "POST",
                        body: JSON.stringify({ token: inviteToken }),
                    }
                );

                if (aborted) return;
                store.setCurrentMember(joinData.member);

                // 2. Parallel fetch: room data, messages, members
                const [roomData, messagesData, membersData] = await Promise.all([
                    apiFetch<{ room: DiscussionRoom }>(`/api/rooms/${roomId}/details`),
                    apiFetch<{ messages: RoomMessage[]; hasMore: boolean }>(
                        `/api/rooms/${roomId}/messages`
                    ),
                    apiFetch<{ members: RoomMember[] }>(`/api/rooms/${roomId}/members`),
                ]);

                if (aborted) return;

                store.setRoom(roomData.room);
                store.setMessages(messagesData.messages);
                store.setMembers(membersData.members);

                // 3. Fetch code session if active
                if (roomData.room.activeCodeSessionId) {
                    try {
                        const sessionData = await apiFetch<{ session: CodeSession }>(
                            `/api/rooms/${roomId}/session/${roomData.room.activeCodeSessionId}`
                        );
                        if (!aborted) store.setCodeSession(sessionData.session);
                    } catch {
                        // Session might have ended between fetches — non-fatal
                    }
                }

                if (!aborted) store.setInitialized(true);
            } catch (err) {
                if (!aborted) {
                    store.setInitError(
                        err instanceof Error ? err.message : "Failed to initialize room"
                    );
                }
            } finally {
                if (!aborted) store.setInitializing(false);
            }
        }

        initialize();

        // Cleanup: leave room on unmount
        return () => {
            aborted = true;

            const headers: Record<string, string> = {
                "Content-Type": "application/json",
            };
            if (jwtRef.current) {
                headers["Authorization"] = `Bearer ${jwtRef.current}`;
            }

            // Use keepalive so the request completes even on tab close
            fetch(`/api/rooms/${roomId}/leave`, {
                method: "POST",
                keepalive: true,
                headers,
            }).catch(() => {});

            // Reset store for next mount
            useRoomStore.getState().resetStore();
            initializedRef.current = false;
        };
    }, [roomId, inviteToken]);
}
