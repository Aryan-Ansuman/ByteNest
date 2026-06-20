"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
    name: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    className?: string;
    /** If provided, renders an <img> from Appwrite avatars instead of initials */
    src?: string;
}

const SIZE_CLASSES = {
    xs: "size-5 text-[9px]",
    sm: "size-7 text-[10px]",
    md: "size-9 text-xs",
    lg: "size-11 text-sm",
    xl: "size-16 text-lg",
} as const;

const COLOR_PAIRS: Array<[string, string]> = [
    ["bg-emerald-900/40 border-emerald-500/20", "text-emerald-300"],
    ["bg-sky-900/40 border-sky-500/20", "text-sky-300"],
    ["bg-violet-900/40 border-violet-500/20", "text-violet-300"],
    ["bg-amber-900/40 border-amber-500/20", "text-amber-300"],
    ["bg-rose-900/40 border-rose-500/20", "text-rose-300"],
    ["bg-teal-900/40 border-teal-500/20", "text-teal-300"],
    ["bg-orange-900/40 border-orange-500/20", "text-orange-300"],
];

export function getUserInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return (parts[0][0] ?? "?").toUpperCase();
    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function getAvatarColors(seed: string): [string, string] {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return COLOR_PAIRS[Math.abs(hash) % COLOR_PAIRS.length];
}

export default function UserAvatar({ name, size = "md", className, src }: UserAvatarProps) {
    const initials = getUserInitials(name);
    const [bgBorder, textColor] = getAvatarColors(name);
    const sizeClass = SIZE_CLASSES[size];

    if (src) {
        return (
            <img
                src={src}
                alt={name}
                className={cn(
                    "shrink-0 rounded-xl border border-white/10 object-cover",
                    sizeClass,
                    className
                )}
                onError={(e) => {
                    // If image fails, show initials fallback by hiding img
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    const next = (e.currentTarget as HTMLImageElement).nextElementSibling;
                    if (next) (next as HTMLElement).style.display = "flex";
                }}
            />
        );
    }

    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center justify-center rounded-xl border font-semibold",
                bgBorder,
                textColor,
                sizeClass,
                className
            )}
            aria-label={name}
            title={name}
        >
            {initials}
        </span>
    );
}
