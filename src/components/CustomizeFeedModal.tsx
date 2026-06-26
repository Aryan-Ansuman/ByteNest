"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Hash, Check, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/Auth";
import { cn } from "@/lib/utils";

const SUGGESTED_TAGS = [
    "javascript", "typescript", "react", "next.js", "node.js",
    "python", "css", "tailwindcss", "sql", "docker", "git", "api",
];

export default function CustomizeFeedModal({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { user, toggleFollowTag } = useAuthStore();
    const followedTags: string[] = user?.prefs?.followedTags ?? [];
    const [pendingTag, setPendingTag] = React.useState<string | null>(null);

    const handleToggle = async (tag: string) => {
        const wasFollowed = followedTags.includes(tag);
        setPendingTag(tag);
        try {
            await toggleFollowTag(tag);
            toast.success(wasFollowed ? `Unfollowed #${tag}` : `Following #${tag}`);
        } catch {
            toast.error("Could not update tag preference");
        } finally {
            setPendingTag(null);
        }
    };

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-center justify-end bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-full w-full max-w-sm overflow-y-auto border-l border-white/5 bg-[#0c0c0c] p-6"
                    >
                        <div className="mb-6 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Settings2 className="size-4 text-[#a7c8b3]" />
                                <h2 className="text-base font-semibold text-zinc-100">
                                    Customize your feed
                                </h2>
                            </div>
                            <button
                                onClick={onClose}
                                aria-label="Close"
                                className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-300"
                            >
                                <X className="size-4" />
                            </button>
                        </div>

                        <p className="mb-4 text-sm text-zinc-500">
                            Follow tags to prioritize matching questions in your{" "}
                            <span className="text-zinc-300">For you</span> feed.
                        </p>

                        {!user ? (
                            <p className="rounded-xl border border-white/5 bg-white/[0.03] p-4 text-sm text-zinc-500">
                                Sign in to follow tags and personalize your feed.
                            </p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {SUGGESTED_TAGS.map((tag) => {
                                    const isFollowed = followedTags.includes(tag);
                                    return (
                                        <button
                                            key={tag}
                                            onClick={() => handleToggle(tag)}
                                            disabled={pendingTag === tag}
                                            aria-pressed={isFollowed}
                                            className={cn(
                                                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50",
                                                isFollowed
                                                    ? "border-[#a7c8b3]/30 bg-[#a7c8b3]/15 text-[#a7c8b3]"
                                                    : "border-white/5 bg-white/[0.03] text-zinc-400 hover:border-[#a7c8b3]/20 hover:text-zinc-200"
                                            )}
                                        >
                                            {isFollowed ? <Check className="size-3" /> : <Hash className="size-3" />}
                                            {tag}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {followedTags.length > 0 && (
                            <div className="mt-6">
                                <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                                    Currently following ({followedTags.length})
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {followedTags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-2.5 py-1 text-[11px] text-[#a7c8b3]"
                                        >
                                            #{tag}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
