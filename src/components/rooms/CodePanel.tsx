"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useRoomStore } from "@/store/roomStore";
import type { CodeSession } from "@/types/rooms";
import SessionStartModal from "./SessionStartModal";
import { Code2, Code } from "lucide-react";
import { motion } from "framer-motion";

// Monaco must not run on server
const CodePanelInner = dynamic(() => import("./CodePanelInner"), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center bg-[#080808] text-tx-disabled text-sm">
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
            <div className="flex flex-col h-full bg-[#09090b]">
                <div className="flex-1 flex flex-col justify-center items-center p-6 text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                        className="flex flex-col items-center"
                    >
                        {/* Glow + Icon */}
                        <div className="relative mb-8">
                            <div className="absolute inset-0 bg-[#a7c8b3] opacity-[0.15] blur-2xl rounded-full" />
                            <Code className="w-12 h-12 text-[#a7c8b3] relative z-10 opacity-90" strokeWidth={1.5} />
                        </div>

                        <h3 className="text-[20px] font-semibold text-zinc-100 mb-3 tracking-tight">Ready to collaborate</h3>
                        
                        {isHost ? (
                            <>
                                <p className="text-[14px] text-zinc-400 mb-8 max-w-[280px] leading-relaxed">
                                    Invite teammates or start typing.
                                </p>
                                <button
                                    onClick={() => setShowModal(true)}
                                    className="px-6 py-2.5 bg-[#a7c8b3] hover:bg-white text-[#08100b] text-[13px] font-[600] rounded-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(167,200,179,0.3)]"
                                >
                                    Start Session
                                </button>
                            </>
                        ) : (
                            <p className="text-[14px] text-zinc-500 max-w-[280px] mt-4">
                                Waiting for the host to start a code session.
                            </p>
                        )}
                    </motion.div>
                </div>

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
