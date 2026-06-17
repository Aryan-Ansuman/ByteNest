"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, HomeIcon, Tags, UserRound, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import { useAuthStore } from "@/store/Auth";

const sidebarItems = [
    { label: "Home", icon: HomeIcon, href: "/" },
    { label: "Questions", icon: Tags, href: "/questions" },
    { label: "Profile", icon: UserRound, href: "/users" },
    { label: "Bookmarks", icon: Bookmark, href: "/bookmarks" },
];

export default function DesktopSidebar() {
    const pathname = usePathname();
    const { user } = useAuthStore();

    // Static popular tags fallback for global layout
    const popularTags = ["javascript", "react", "next.js", "typescript", "tailwindcss"];

    return (
        <aside className="fixed left-0 top-16 hidden h-[calc(100vh-4rem)] w-60 border-r border-white/10 bg-[#080808] px-4 py-6 lg:block">
            <nav className="space-y-1">
                {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    let href = item.href;
                    if (item.label === "Profile" && user) {
                        href = `/users/${user.$id}/${slugify(user.name)}`;
                    }

                    // A basic active state check:
                    let isActive = false;
                    if (item.label === "Home" && pathname === "/") isActive = true;
                    if (item.label !== "Home" && pathname.startsWith(href)) isActive = true;

                    return (
                        <Link
                            key={item.label}
                            href={href}
                            className={cn(
                                "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm transition duration-200 hover:bg-white/[0.05] hover:text-zinc-100",
                                isActive
                                    ? "border border-white/10 bg-white/[0.07] text-zinc-100"
                                    : "text-zinc-500"
                            )}
                        >
                            <Icon className={cn("size-4", isActive && "text-[#a7c8b3]")} />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
            </nav>

            <div className="mt-8">
                <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                    Popular Tags
                </p>
                {popularTags.map((tag) => (
                    <Link
                        key={tag}
                        href={`/questions?tag=${tag}`}
                        className="flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
                    >
                        <Hash className="size-3 text-[#a7c8b3]/60" />
                        {tag}
                    </Link>
                ))}
            </div>
        </aside>
    );
}
