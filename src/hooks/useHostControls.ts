import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";

type ModeratePayload =
    | { action: "mute"; targetUserId: string }
    | { action: "unmute"; targetUserId: string }
    | { action: "kick"; targetUserId: string }
    | { action: "transfer"; targetUserId: string }
    | { action: "view_only"; viewOnly: boolean };

/**
 * Wraps PATCH /api/rooms/[id]/moderate.
 * `loading` is a string key uniquely identifying the in-flight action so
 * callers can show per-action spinners. Format: "<action>:<targetUserId>"
 * for member actions, "view_only:<bool>" for session toggles.
 */
export function useHostControls(roomId: string) {
    const [loading, setLoading] = useState<string | null>(null);

    const moderate = useCallback(
        async (payload: ModeratePayload, key: string): Promise<void> => {
            setLoading(key);
            try {
                await apiFetch(`/api/rooms/${roomId}/moderate`, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });
            } finally {
                setLoading(null);
            }
        },
        [roomId]
    );

    const muteMember = useCallback(
        (targetUserId: string) =>
            moderate({ action: "mute", targetUserId }, `mute:${targetUserId}`),
        [moderate]
    );

    const unmuteMember = useCallback(
        (targetUserId: string) =>
            moderate(
                { action: "unmute", targetUserId },
                `unmute:${targetUserId}`
            ),
        [moderate]
    );

    const kickMember = useCallback(
        (targetUserId: string) =>
            moderate({ action: "kick", targetUserId }, `kick:${targetUserId}`),
        [moderate]
    );

    const transferHost = useCallback(
        (targetUserId: string) =>
            moderate(
                { action: "transfer", targetUserId },
                `transfer:${targetUserId}`
            ),
        [moderate]
    );

    const setViewOnly = useCallback(
        (enabled: boolean) =>
            moderate(
                { action: "view_only", viewOnly: enabled },
                `view_only:${enabled}`
            ),
        [moderate]
    );

    return {
        loading,
        muteMember,
        unmuteMember,
        kickMember,
        transferHost,
        setViewOnly,
    };
}
