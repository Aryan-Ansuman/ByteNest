"use client";

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    User,
    Pencil,
    Activity,
    Bookmark,
    FileEdit,
    Award,
    Palette,
    Settings,
    LogOut,
    ChevronDown,
} from "lucide-react";
import { avatars } from "@/models/client/config";
import { useAuthStore } from "@/store/Auth";
import slugify from "@/utils/slugify";
import { cn } from "@/lib/utils";

interface ProfileMenuProps {
    /** Optional override; otherwise pulled from useAuthStore */
    name?: string;
    reputation?: number;
}

/**
 * Avatar-triggered dropdown. This is the ONLY place profile/account actions
 * live — sidebar and topbar never duplicate these.
 */
export default function ProfileMenu({ name, reputation }: ProfileMenuProps) {
    const { user, logout } = useAuthStore();
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const displayName = name ?? user?.name ?? "Guest";
    const displayReputation = reputation ?? user?.prefs?.reputation ?? 0;
    const userId = user?.$id ?? "";
    const userSlug = slugify(displayName);

    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, []);

    if (!user) {
        return (
            <div className="flex items-center gap-2">
                <Link
                    href="/login"
                    className="flex h-9 items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-zinc-300 transition duration-150 ease-out hover:bg-white/[0.08] hover:text-zinc-100"
                >
                    Sign in
                </Link>
            </div>
        );
    }

    const menuItems: {
        label: string;
        icon: React.ReactNode;
        href?: string;
        onClick?: () => void;
        danger?: boolean;
    }[] = [
        { label: "View profile", icon: <User className="size-4" />, href: `/users/${userId}/${userSlug}` },
        { label: "Edit profile", icon: <Pencil className="size-4" />, href: `/users/${userId}/${userSlug}/edit` },
        { label: "Activity", icon: <Activity className="size-4" />, href: `/users/${userId}/${userSlug}/answers` },
        { label: "Saved questions", icon: <Bookmark className="size-4" />, href: "/saved" },
        { label: "Drafts", icon: <FileEdit className="size-4" />, href: "/drafts" },
        { label: "Achievements", icon: <Award className="size-4" />, href: `/users/${userId}/${userSlug}#achievements` },
        { label: "Appearance", icon: <Palette className="size-4" />, href: "/settings/appearance" },
        { label: "Settings", icon: <Settings className="size-4" />, href: "/settings" },
    ];

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                className={cn(
                    "flex h-10 items-center gap-2 rounded-xl border px-1.5 transition duration-150 ease-out",
                    open
                        ? "border-white/15 bg-white/[0.08]"
                        : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                )}
            >
                <img
                    src={avatars.getInitials(displayName, 28, 28).href}
                    alt={displayName}
                    className="size-7 rounded-lg"
                />
                <ChevronDown
                    className={cn(
                        "size-3.5 text-zinc-500 transition-transform duration-150",
                        open && "rotate-180 text-zinc-300"
                    )}
                />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                        role="menu"
                        className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0c]/95 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl"
                    >
                        {/* Profile header */}
                        <Link
                            href={`/users/${userId}/${userSlug}`}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 border-b border-white/[0.06] p-4 transition hover:bg-white/[0.03]"
                        >
                            <img
                                src={avatars.getInitials(displayName, 44, 44).href}
                                alt={displayName}
                                className="size-11 rounded-xl border border-white/10"
                            />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-zinc-100">
                                    {displayName}
                                </p>
                                <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                                    <span className="font-medium text-[#a7c8b3]">
                                        {displayReputation.toLocaleString()}
                                    </span>
                                    reputation
                                </p>
                            </div>
                        </Link>

                        {/* Menu items */}
                        <div className="py-1.5">
                            {menuItems.map((item) => (
                                <Link
                                    key={item.label}
                                    href={item.href!}
                                    role="menuitem"
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition duration-150 ease-out hover:bg-white/[0.05] hover:text-zinc-100"
                                >
                                    <span className="text-zinc-500">{item.icon}</span>
                                    {item.label}
                                </Link>
                            ))}
                        </div>

                        {/* Logout */}
                        <div className="border-t border-white/[0.06] py-1.5">
                            <button
                                role="menuitem"
                                onClick={() => {
                                    setOpen(false);
                                    logout();
                                }}
                                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400/80 transition duration-150 ease-out hover:bg-red-500/10 hover:text-red-400"
                            >
                                <LogOut className="size-4" />
                                Log out
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
