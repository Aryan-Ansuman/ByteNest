"use client";

import { useEffect, useState } from "react";
import { DiscussionRoom } from "@/types/rooms";
import { client } from "@/models/client/config";
import { db, discussionRoomsCollection } from "@/models/name";
import Link from "next/link";
import { Users, Code, Lock } from "lucide-react";
import { useRouter } from "next/navigation";

interface Props {
    initialRooms: DiscussionRoom[];
    activeTag?: string;
}

export default function RoomsClient({ initialRooms, activeTag }: Props) {
    const [rooms, setRooms] = useState<DiscussionRoom[]>(initialRooms);
    const router = useRouter();

    useEffect(() => {
        // Appwrite Realtime subscription on the discussion_rooms collection
        const channel = `databases.${db}.collections.${discussionRoomsCollection}.documents`;
        
        const unsubscribe = client.subscribe(channel, (response) => {
            const payload = response.payload as DiscussionRoom;

            // Only track public & active rooms
            const isValid =
                payload.status === "active" && payload.visibility === "public";

            // If tag filtering is active, enforce it locally
            if (isValid && activeTag) {
                if (!payload.tags?.includes(activeTag)) return;
            }

            setRooms((current) => {
                const exists = current.some((r) => r.$id === payload.$id);

                if (
                    response.events.some(
                        (e) => e.includes(".create") || e.includes(".update")
                    )
                ) {
                    if (isValid) {
                        // Upsert
                        const next = exists
                            ? current.map((r) =>
                                  r.$id === payload.$id ? payload : r
                              )
                            : [...current, payload];
                        // Sort by memberCount descending
                        return next.sort((a, b) => b.memberCount - a.memberCount);
                    } else {
                        // If it became private or archived, remove it
                        return current.filter((r) => r.$id !== payload.$id);
                    }
                }

                if (response.events.some((e) => e.includes(".delete"))) {
                    return current.filter((r) => r.$id !== payload.$id);
                }

                return current;
            });
        });

        return () => unsubscribe();
    }, [activeTag]);

    const handleTagClick = (tag: string) => {
        if (tag === activeTag) {
            router.push("/rooms");
        } else {
            router.push(`/rooms?tag=${encodeURIComponent(tag)}`);
        }
    };

    if (rooms.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center border border-zinc-800 border-dashed rounded-xl">
                <p className="text-zinc-500 mb-4">No public rooms found.</p>
                {activeTag ? (
                    <button
                        onClick={() => router.push("/rooms")}
                        className="text-indigo-400 hover:underline text-sm"
                    >
                        Clear filter
                    </button>
                ) : (
                    <Link
                        href="/rooms/create" // Assuming you'll have a create page
                        className="px-4 py-2 bg-indigo-500 text-white font-medium rounded-lg hover:bg-indigo-600 transition"
                    >
                        Create a Room
                    </Link>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {activeTag && (
                <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-400">Filtered by:</span>
                    <button
                        onClick={() => router.push("/rooms")}
                        className="px-2.5 py-1 rounded-md bg-indigo-500/20 text-indigo-400 text-xs font-semibold hover:bg-indigo-500/30 transition flex items-center gap-1"
                    >
                        #{activeTag}
                        <span className="ml-1 text-indigo-400/50 hover:text-indigo-400">&times;</span>
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rooms.map((room) => (
                    <Link
                        key={room.$id}
                        href={`/rooms/${room.$id}`}
                        className="block p-5 rounded-xl border border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/50 transition group"
                    >
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="font-semibold text-lg text-zinc-200 group-hover:text-white transition">
                                {room.name}
                            </h3>
                            {room.activeCodeSessionId && (
                                <span className="bg-emerald-500/10 text-emerald-400 text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                    <Code size={12} /> Live Code
                                </span>
                            )}
                        </div>
                        
                        <p className="text-sm text-zinc-400 line-clamp-2 mb-4 h-10">
                            {room.description || "No description provided."}
                        </p>

                        <div className="flex items-center justify-between mt-auto">
                            <div className="flex flex-wrap gap-1.5">
                                {room.tags?.slice(0, 3).map((tag) => (
                                    <button
                                        key={tag}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleTagClick(tag);
                                        }}
                                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition"
                                    >
                                        #{tag}
                                    </button>
                                ))}
                                {room.tags && room.tags.length > 3 && (
                                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-800/50 text-zinc-500">
                                        +{room.tags.length - 3}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 shrink-0">
                                <Users size={14} />
                                <span>{room.memberCount} / {room.maxMembers}</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
