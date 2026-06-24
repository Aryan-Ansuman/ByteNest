"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRoomStore } from "@/store/roomStore";
import type { CodeSession } from "@/types/rooms";
import SessionStartModal from "./SessionStartModal";
import { Code2 } from "lucide-react";

// Monaco must not run on server
const CodePanelInner = dynamic(() => import("./CodePanelInner"), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center bg-[#0a0a0a] text-zinc-600 text-sm">
            Loading editor…
        </div>
    ),
});

interface Props {
    roomId: string;
    session: CodeSession | null;
}

export default function CodePanel({ roomId, session }: Props) {
    const [showModal, setShowModal] = useState(false);
    const room = useRoomStore((s) => s.room);
    const currentMember = useRoomStore((s) => s.currentMember);
    const isHost = currentMember?.userId === room?.hostId;

    if (!session) {
        return (
            <div className="flex flex-col h-full items-center justify-center bg-[#0a0a0a] gap-5">
                {isHost ? (
                    <>
                        <div className="text-center space-y-3">
                            <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-400 mb-4 shadow-sm">
                                <Code2 strokeWidth={1.5} className="w-6 h-6" />
                            </div>
                            <p className="text-zinc-300 text-sm font-medium">
                                No active code session
                            </p>
                            <p className="text-zinc-500 text-xs max-w-xs leading-relaxed">
                                Start a session to code collaboratively with
                                everyone in real time
                            </p>
                        </div>
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-5 py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white text-[13px] font-medium rounded-xl transition-all duration-200 active:scale-95 shadow-sm shadow-indigo-500/20"
                        >
                            Start Code Session
                        </button>
                    </>
                ) : (
                    <div className="text-center space-y-3">
                        <div className="w-2.5 h-2.5 rounded-full bg-indigo-500/50 mx-auto animate-ping" />
                        <p className="text-zinc-500 text-xs font-medium">
                            Waiting for host to start a session…
                        </p>
                    </div>
                )}

                {showModal && (
                    <SessionStartModal
                        roomId={roomId}
                        onClose={() => setShowModal(false)}
                    />
                )}
            </div>
        );
    }

    return <CodePanelInner roomId={roomId} session={session} />;
}
