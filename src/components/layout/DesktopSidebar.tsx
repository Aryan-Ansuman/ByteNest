"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, HomeIcon, Tags, UserRound, Hash, Plus, Check, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import { useAuthStore } from "@/store/Auth";
import { toast } from "sonner";

const sidebarItems = [
    { label: "Home", icon: HomeIcon, href: "/" },
    { label: "Questions", icon: Tags, href: "/questions" },
    { label: "Profile", icon: UserRound, href: "/users" },
    { label: "Live Rooms", icon: Radio, href: "/rooms" },
    { label: "Bookmarks", icon: Bookmark, href: "/bookmarks" },
];

export default function DesktopSidebar() {
    const pathname = usePathname();
    const { user, session, toggleFollowTag } = useAuthStore();

    // Static popular tags fallback for global layout
    const popularTags = ["javascript", "react", "next.js", "typescript", "tailwindcss"];
    const followedTags: string[] = user?.prefs?.followedTags ?? [];

    const handleFollowTag = async (tag: string) => {
        if (!session) {
            toast.warning("Sign in to follow tags");
            return;
        }
        try {
            await toggleFollowTag(tag);
            const isNowFollowed = !followedTags.includes(tag);
            toast.success(isNowFollowed ? `Following #${tag}` : `Unfollowed #${tag}`);
        } catch {
            toast.error("Could not update tag preference");
        }
    };

    return (
        <aside className="fixed left-0 top-16 hidden h-[calc(100vh-4rem)] w-60 border-r border-white/5 bg-[#080808] px-4 py-6 lg:block">
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
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                                "relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm transition duration-200",
                                isActive
                                    ? "bg-[#a7c8b3]/10 text-zinc-100"
                                    : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-100"
                            )}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#a7c8b3]" />
                            )}
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
                {popularTags.map((tag) => {
                    const isFollowed = followedTags.includes(tag);
                    return (
                        <div
                            key={tag}
                            className="group flex h-8 items-center gap-2 rounded-lg px-3 text-xs text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
                        >
                            <Link
                                href={`/questions?tag=${tag}`}
                                className="flex flex-1 items-center gap-2 min-w-0"
                            >
                                <Hash className="size-3 shrink-0 text-[#a7c8b3]/60" />
                                <span className="truncate">{tag}</span>
                            </Link>
                            <button
                                onClick={() => handleFollowTag(tag)}
                                aria-label={isFollowed ? `Unfollow ${tag}` : `Follow ${tag}`}
                                className={cn(
                                    "shrink-0 size-4 flex items-center justify-center rounded transition opacity-0 group-hover:opacity-100",
                                    isFollowed
                                        ? "text-[#a7c8b3] opacity-100"
                                        : "text-zinc-600 hover:text-[#a7c8b3]"
                                )}
                            >
                                {isFollowed ? (
                                    <Check className="size-3" />
                                ) : (
                                    <Plus className="size-3" />
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
