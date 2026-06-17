"use client";

import React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ChevronDown, MessageSquare, MessagesSquare, BarChart3, FileEdit } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Single entry point for creating content. Replaces the old "Ask Question"
 * button that was scattered across topbar, sidebar, and profile pages.
 */
export default function CreateMenu() {
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

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

    const items = [
        {
            label: "Question",
            description: "Ask the community something",
            icon: <MessageSquare className="size-4" />,
            href: "/questions/ask",
        },
        {
            label: "Discussion",
            description: "Start an open-ended conversation",
            icon: <MessagesSquare className="size-4" />,
            href: "/discussions/new",
        },
        {
            label: "Poll",
            description: "Get quick opinions from devs",
            icon: <BarChart3 className="size-4" />,
            href: "/polls/new",
        },
        {
            label: "Draft",
            description: "Save an idea for later",
            icon: <FileEdit className="size-4" />,
            href: "/drafts/new",
        },
    ];

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                className={cn(
                    "flex h-10 items-center gap-1.5 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-3.5 text-sm font-medium text-[#08100b] shadow-none transition duration-150 ease-out hover:bg-[#b4d6bf]",
                    open && "bg-[#b4d6bf]"
                )}
            >
                <Plus className="size-4" />
                <span className="hidden sm:inline">Create</span>
                <ChevronDown
                    className={cn("size-3.5 transition-transform duration-150", open && "rotate-180")}
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
                        className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0c]/95 p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl"
                    >
                        {items.map((item) => (
                            <Link
                                key={item.label}
                                href={item.href}
                                role="menuitem"
                                onClick={() => setOpen(false)}
                                className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition duration-150 ease-out hover:bg-white/[0.06]"
                            >
                                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition group-hover:border-[#a7c8b3]/30 group-hover:text-[#a7c8b3]">
                                    {item.icon}
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium text-zinc-200 transition group-hover:text-zinc-100">
                                        {item.label}
                                    </span>
                                    <span className="block text-xs text-zinc-500">
                                        {item.description}
                                    </span>
                                </span>
                            </Link>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
