"use client";

import React from "react";
import Link from "next/link";
import { useAuthStore } from "@/store/Auth";
import ProfileMenu from "@/components/ProfileMenu";
import CreateMenu from "@/components/CreateMenu";
import CommandPalette from "@/components/CommandPalette";

export default function TopNav() {
    const { session } = useAuthStore();

    return (
        <header className="sticky top-0 z-50 h-16 border-b border-white/5 bg-[#080808]/85 backdrop-blur-xl">
            <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-3 px-4 md:gap-6 md:px-8 lg:px-12">
                <div className="flex w-[240px] shrink-0 items-center">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-xl border border-white/5 bg-gradient-to-br from-white/[0.08] to-white/[0.02]">
                            <svg className="size-5 text-[#a7c8b3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                                <line x1="12" y1="22.08" x2="12" y2="12" />
                            </svg>
                        </div>
                        <span className="hidden text-sm font-semibold text-zinc-100 sm:inline">
                            ByteNest
                        </span>
                    </Link>
                </div>

                <div className="flex flex-1 justify-center px-4">
                    <CommandPalette />
                </div>

                <div className="flex w-[240px] shrink-0 items-center justify-end">
                    {session ? (
                        <div className="flex items-center gap-3">
                            <CreateMenu />
                            <ProfileMenu />
                        </div>
                    ) : (
                        <div className="flex items-center gap-3">
                            <Link
                                href="/login"
                                className="hidden h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-zinc-400 transition hover:text-zinc-100 sm:flex"
                            >
                                Sign In
                            </Link>
                            <Link
                                href="/register"
                                className="flex h-10 items-center justify-center rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-4 text-sm font-medium text-[#08100b] shadow-none transition hover:bg-[#b4d6bf]"
                            >
                                Sign Up
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
