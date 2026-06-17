"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, HomeIcon, Tags, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import slugify from "@/utils/slugify";
import { useAuthStore } from "@/store/Auth";

const sidebarItems = [
    { label: "Home", icon: HomeIcon, href: "/" },
    { label: "Questions", icon: Tags, href: "/questions" },
    { label: "Profile", icon: UserRound, href: "/users" },
    { label: "Bookmarks", icon: Bookmark, href: "/bookmarks" },
];

export default function MobileNav() {
    const pathname = usePathname();
    const { user } = useAuthStore();

    return (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-2xl border border-white/10 bg-[#101010]/90 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden">
            {sidebarItems.map((item) => {
                const Icon = item.icon;
                let href = item.href;
                if (item.label === "Profile" && user) {
                    href = `/users/${user.$id}/${slugify(user.name)}`;
                }

                let isActive = false;
                if (item.label === "Home" && pathname === "/") isActive = true;
                if (item.label !== "Home" && pathname.startsWith(href)) isActive = true;

                return (
                    <Link
                        key={item.label}
                        href={href}
                        aria-label={item.label}
                        className={cn(
                            "flex size-10 items-center justify-center rounded-xl text-zinc-500 transition duration-200 ease-out hover:bg-white/[0.06] hover:text-zinc-100",
                            isActive && "bg-white/[0.08] text-[#a7c8b3]"
                        )}
                    >
                        <Icon className="size-4" />
                    </Link>
                );
            })}
        </div>
    );
}
