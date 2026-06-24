"use client";

import { useRoomInitializer } from "@/hooks/useRoomInitializer";
import { useRoomRealtime } from "@/hooks/useRoomRealtime";
import { useRoomStore } from "@/store/roomStore";
import MemberSidebar from "@/components/rooms/MemberSidebar";
import ChatPanel from "@/components/rooms/ChatPanel";
import CodePanel from "@/components/rooms/CodePanel";
import RoomHeader from "@/components/rooms/RoomHeader";
import RoomError from "@/components/rooms/RoomError";
import RoomSkeleton from "@/components/rooms/RoomSkeleton";

interface Props {
    roomId: string;
    inviteToken?: string;
}

export default function RoomClient({ roomId, inviteToken }: Props) {
    useRoomInitializer(roomId, inviteToken);
    useRoomRealtime(roomId);

    const room = useRoomStore((s) => s.room);
    const isInitialized = useRoomStore((s) => s.isInitialized);
    const isInitializing = useRoomStore((s) => s.isInitializing);
    const initError = useRoomStore((s) => s.initError);
    const codeSession = useRoomStore((s) => s.codeSession);

    const hasCodeSession = Boolean(room?.activeCodeSessionId);

    if (initError) return <RoomError message={initError} />;
    if (isInitializing || !isInitialized) return <RoomSkeleton />;
    if (!room) return null;

    return (
        <div className="flex flex-col h-screen bg-[#080808] text-zinc-100 overflow-hidden">
            {/* Header */}
            <RoomHeader room={room} />

            {/* Body — three columns */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left — member sidebar (fixed 220px) */}
                <aside className="w-[220px] shrink-0 border-r border-zinc-800 overflow-y-auto bg-[#0a0a0a]">
                    <MemberSidebar roomId={roomId} />
                </aside>

                {/* Center — chat panel (shrinks when code panel opens) */}
                <div
                    className={[
                        "flex flex-col overflow-hidden transition-all duration-300 ease-in-out",
                        hasCodeSession ? "w-[420px] shrink-0" : "flex-1",
                    ].join(" ")}
                >
                    <ChatPanel roomId={roomId} />
                </div>

                {/* Right — code panel */}
                <div
                    className={[
                        "overflow-hidden border-l border-zinc-800 transition-all duration-300 ease-in-out",
                        hasCodeSession ? "flex-1" : "w-[300px] shrink-0 xl:w-[400px]",
                    ].join(" ")}
                >
                    <CodePanel roomId={roomId} session={codeSession} />
                </div>
            </div>
        </div>
    );
}
