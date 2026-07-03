"use client";

import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import { useRoomStore } from "@/store/roomStore";

export interface PresenceEntry {
    clientId: number;
    userId: string;
    name: string;
    color: string;
    activeFile: string;
    /** True if this client has no matching RoomMember (e.g. just left) */
    isStale: boolean;
}

/**
 * Subscribes to a Yjs Awareness instance and returns the current set of
 * peers (excluding the local client) as a plain array, re-rendering
 * whenever any peer's state changes — including their `activeFile`.
 *
 * Pure Yjs awareness protocol: no Appwrite queries, no API calls, no
 * room-store writes. `awareness.getStates()` already holds everything
 * needed; this hook just makes it reactive for React and cross-references
 * `userId` against the room's member list for stable display names.
 */
export function usePresenceMap(awareness: Awareness | null): PresenceEntry[] {
    const members = useRoomStore((s) => s.members);
    const [, forceRender] = useState(0);

    useEffect(() => {
        if (!awareness) return;
        const onChange = () => forceRender((n) => n + 1);
        awareness.on("change", onChange);
        return () => awareness.off("change", onChange);
    }, [awareness]);

    if (!awareness) return [];

    const localClientId = awareness.doc.clientID;
    const entries: PresenceEntry[] = [];

    awareness.getStates().forEach((state, clientId) => {
        const user = state?.user;
        if (!user?.userId) return;

        const isMe = clientId === localClientId;
        const member = members.find((m) => m.userId === user.userId);

        entries.push({
            clientId,
            userId: user.userId,
            name: (member?.displayName ?? user.name ?? "Someone") + (isMe ? " (YOU)" : ""),
            color: user.color ?? "#6366f1",
            activeFile: user.activeFile ?? "",
            isStale: !member,
        });
    });

    // Stable order so the panel doesn't reshuffle on every keystroke
    entries.sort((a, b) => a.userId.localeCompare(b.userId));

    return entries;
}
