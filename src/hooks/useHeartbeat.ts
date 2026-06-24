"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/api-fetch";

export function useHeartbeat(roomId: string) {
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (!roomId) return;

        async function ping(status: "online" | "away") {
            try {
                await apiFetch(`/api/rooms/${roomId}/heartbeat`, {
                    method: "PATCH",
                    body: JSON.stringify({ status }),
                });
            } catch {
                // best effort
            }
        }

        // Ping immediately on mount
        ping("online");

        // Ping every 15 seconds
        intervalRef.current = setInterval(() => ping("online"), 15_000);

        // Tab visibility changes
        function handleVisibility() {
            ping(document.visibilityState === "visible" ? "online" : "away");
        }

        // Send leave signal on tab close (keepalive keeps it alive after unload)
        function handlePageHide() {
            fetch(`/api/rooms/${roomId}/leave`, {
                method: "POST",
                keepalive: true,
                headers: { "Content-Type": "application/json" },
            }).catch(() => {});
        }

        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("pagehide", handlePageHide);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("pagehide", handlePageHide);
        };
    }, [roomId]);
}
