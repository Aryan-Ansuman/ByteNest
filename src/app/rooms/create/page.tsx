"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { DiscussionRoom } from "@/types/rooms";

export default function CreateRoomPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        name: "",
        description: "",
        visibility: "public",
        slowMode: "off",
        tags: "",
    });

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        const tagsArray = form.tags
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);

        try {
            const data = await apiFetch<{ room: DiscussionRoom }>("/api/rooms", {
                method: "POST",
                body: JSON.stringify({
                    ...form,
                    tags: tagsArray,
                }),
            });

            // Redirect to the newly created room
            router.push(`/rooms/${data.room.$id}`);
        } catch (err: any) {
            setError(err.message || "Failed to create room");
            setLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-[#0a0a0a] text-white p-8 flex items-center justify-center">
            <div className="w-full max-w-md bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                <h1 className="text-2xl font-bold mb-2">Create a Room</h1>
                <p className="text-zinc-400 text-sm mb-6">
                    Set up a new space to chat and write code together.
                </p>

                {error && (
                    <div className="p-3 mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm rounded-lg">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                            Room Name
                        </label>
                        <input
                            required
                            maxLength={100}
                            className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            placeholder="e.g. React Debugging Session"
                            value={form.name}
                            onChange={(e) =>
                                setForm({ ...form, name: e.target.value })
                            }
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                            Description (Optional)
                        </label>
                        <textarea
                            maxLength={300}
                            rows={3}
                            className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                            placeholder="What's this room about?"
                            value={form.description}
                            onChange={(e) =>
                                setForm({ ...form, description: e.target.value })
                            }
                        />
                    </div>

                    {/* Visibility & Slow Mode */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1">
                                Visibility
                            </label>
                            <select
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors text-white"
                                value={form.visibility}
                                onChange={(e) =>
                                    setForm({ ...form, visibility: e.target.value })
                                }
                            >
                                <option value="public">Public</option>
                                <option value="private">Private (Invite Only)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-zinc-300 mb-1">
                                Slow Mode
                            </label>
                            <select
                                className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors text-white"
                                value={form.slowMode}
                                onChange={(e) =>
                                    setForm({ ...form, slowMode: e.target.value })
                                }
                            >
                                <option value="off">Off</option>
                                <option value="5s">5s</option>
                                <option value="30s">30s</option>
                                <option value="60s">60s</option>
                            </select>
                        </div>
                    </div>

                    {/* Tags */}
                    <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                            Tags (comma separated)
                        </label>
                        <input
                            className="w-full bg-black/40 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            placeholder="e.g. react, nextjs, help"
                            value={form.tags}
                            onChange={(e) =>
                                setForm({ ...form, tags: e.target.value })
                            }
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !form.name.trim()}
                        className="w-full mt-6 bg-indigo-500 text-white font-medium rounded-lg px-4 py-2 hover:bg-indigo-600 focus:outline-none disabled:opacity-50 transition flex justify-center items-center gap-2"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {loading ? "Creating Room..." : "Create Room"}
                    </button>
                    
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => router.back()}
                        className="w-full mt-3 bg-transparent text-zinc-400 font-medium rounded-lg px-4 py-2 hover:text-white transition"
                    >
                        Cancel
                    </button>
                </form>
            </div>
        </main>
    );
}
