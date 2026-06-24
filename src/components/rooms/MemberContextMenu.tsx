"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
    Crown,
    Loader2,
    MoreVertical,
    UserX,
    Volume2,
    VolumeX,
} from "lucide-react";
import { useHostControls } from "@/hooks/useHostControls";
import { RoomMember } from "@/types/rooms";

interface Props {
    member: RoomMember;
    roomId: string;
    /** True only when the viewing user is currently the host. */
    isHost: boolean;
    /** The viewing user's own Appwrite $id — prevents self-targeting. */
    currentUserId: string;
}

/**
 * Three-dot context menu rendered on a member row in the sidebar.
 * Parent row must have the `group` Tailwind class for the trigger to
 * fade in on hover.
 */
export function MemberContextMenu({
    member,
    roomId,
    isHost,
    currentUserId,
}: Props) {
    const [open, setOpen] = useState(false);
    const [confirmKick, setConfirmKick] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const { loading, muteMember, unmuteMember, kickMember, transferHost } =
        useHostControls(roomId);

    useEffect(() => {
        function onClickOutside(e: MouseEvent) {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
                setConfirmKick(false);
            }
        }
        if (open) document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, [open]);

    // only the host sees this; host cannot moderate themselves
    if (!isHost || member.userId === currentUserId) return null;

    // loading key helpers
    const isBusy = (prefix: string) => loading === `${prefix}:${member.userId}`;
    const anyBusy = !!loading;

    // -------------------------------------------------------------------------
    // Handlers
    // -------------------------------------------------------------------------

    async function handleMuteToggle() {
        try {
            if (member.status === "muted") {
                await unmuteMember(member.userId);
            } else {
                await muteMember(member.userId);
            }
        } finally {
            setOpen(false);
        }
    }

    async function handleTransferHost() {
        try {
            await transferHost(member.userId);
        } finally {
            setOpen(false);
        }
    }

    async function handleKick() {
        if (!confirmKick) {
            setConfirmKick(true);
            return;
        }
        try {
            await kickMember(member.userId);
        } finally {
            setOpen(false);
            setConfirmKick(false);
        }
    }

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------

    return (
        <div ref={menuRef} className="relative">
            {/* trigger — parent row needs `group` class */}
            <button
                onClick={() => {
                    setOpen((v) => !v);
                    setConfirmKick(false);
                }}
                className="flex items-center justify-center rounded-lg p-1 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                aria-label={`Options for ${member.displayName}`}
            >
                <MoreVertical size={14} />
            </button>

            {/* dropdown */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        className="absolute right-0 top-8 z-50 w-44 overflow-hidden rounded-xl border border-zinc-800 bg-[#0e0e0e] py-1 shadow-2xl"
                    >
                        {/* ── Mute / Unmute ────────────────────────────────────── */}
                        <MenuItem
                            onClick={handleMuteToggle}
                            disabled={isBusy("mute") || isBusy("unmute")}
                            icon={
                                isBusy("mute") || isBusy("unmute") ? (
                                    <Loader2
                                        size={13}
                                        className="animate-spin"
                                    />
                                ) : member.status === "muted" ? (
                                    <Volume2
                                        size={13}
                                        className="text-emerald-400"
                                    />
                                ) : (
                                    <VolumeX size={13} />
                                )
                            }
                            label={
                                member.status === "muted" ? "Unmute" : "Mute"
                            }
                        />

                        {/* ── Transfer host ────────────────────────────────────── */}
                        <MenuItem
                            onClick={handleTransferHost}
                            disabled={anyBusy}
                            icon={
                                isBusy("transfer") ? (
                                    <Loader2
                                        size={13}
                                        className="animate-spin"
                                    />
                                ) : (
                                    <Crown
                                        size={13}
                                        className="text-amber-400"
                                    />
                                )
                            }
                            label="Transfer host"
                        />

                        <div className="my-1 border-t border-zinc-800" />

                        {/* ── Kick ─────────────────────────────────────────────── */}
                        <MenuItem
                            onClick={handleKick}
                            disabled={isBusy("kick")}
                            danger
                            confirm={confirmKick}
                            icon={
                                isBusy("kick") ? (
                                    <Loader2
                                        size={13}
                                        className="animate-spin"
                                    />
                                ) : (
                                    <UserX size={13} />
                                )
                            }
                            label={confirmKick ? "Confirm kick" : "Kick"}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Sub-component: menu item
// ---------------------------------------------------------------------------

interface MenuItemProps {
    onClick: () => void;
    disabled: boolean;
    icon: React.ReactNode;
    label: string;
    danger?: boolean;
    confirm?: boolean;
}

function MenuItem({
    onClick,
    disabled,
    icon,
    label,
    danger,
    confirm,
}: MenuItemProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={[
                "flex w-full items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40",
                danger
                    ? confirm
                        ? "text-rose-400 bg-rose-500/10"
                        : "text-zinc-400 hover:bg-zinc-800/50 hover:text-rose-400"
                    : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200",
            ].join(" ")}
        >
            {icon}
            {label}
        </button>
    );
}
