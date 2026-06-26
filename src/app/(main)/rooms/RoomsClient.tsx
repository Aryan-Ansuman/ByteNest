"use client";

import { useEffect, useState, useMemo } from "react";
import { DiscussionRoom, RoomMessage, RoomMember } from "@/types/rooms";
import { client } from "@/models/client/config";
import { db, discussionRoomsCollection } from "@/models/name";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    Users, Code2, Lock, Globe, Search, X, Plus, Radio,
    Hash, Timer, ArrowUpRight, AlertCircle, SlidersHorizontal,
    Zap, Clock, TrendingUp, MessageSquare, ChevronRight,
    Terminal, Database, Cloud, Layout, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getUserAvatarStyle, getUserInitials } from "@/utils/userDisplay";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnrichedRoom extends DiscussionRoom {
    lastMessage?: RoomMessage;
    onlineMembers?: RoomMember[];
}

interface Props {
    enrichedRooms: EnrichedRoom[];
    errorParam?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_TABS = [
    { id: "all",       label: "All",            icon: null },
    { id: "live",      label: "Live",           icon: "live" },
    { id: "react",     label: "React",          tag: "react" },
    { id: "typescript",label: "TypeScript",     tag: "typescript" },
    { id: "python",    label: "Python",         tag: "python" },
    { id: "system",    label: "System Design",  tag: "system-design" },
    { id: "devops",    label: "DevOps",         tag: "devops" },
] as const;

const SORT_OPTIONS = [
    { value: "popular",  label: "Most Active", icon: TrendingUp },
    { value: "newest",   label: "Newest",      icon: Clock      },
    { value: "activity", label: "Recent",      icon: Zap        },
] as const;

// Tag pill colours — consistent with ByteNest tag rendering
const TAG_PALETTE: Record<string, string> = {
    react:        "border-sky-400/20 bg-sky-400/10 text-sky-300",
    typescript:   "border-blue-400/20 bg-blue-400/10 text-blue-300",
    javascript:   "border-amber-400/20 bg-amber-400/10 text-amber-300",
    python:       "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    docker:       "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
    aws:          "border-orange-400/20 bg-orange-400/10 text-orange-300",
    devops:       "border-violet-400/20 bg-violet-400/10 text-violet-300",
    nextjs:       "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
    "next.js":    "border-zinc-400/20 bg-zinc-400/10 text-zinc-300",
    rust:         "border-orange-600/20 bg-orange-600/10 text-orange-400",
    golang:       "border-cyan-300/20 bg-cyan-300/10 text-cyan-300",
};
const TAG_DEFAULT = "border-white/[0.08] bg-white/[0.04] text-zinc-400";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relTime(dateStr?: string): string {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function activityLevel(room: EnrichedRoom): { bars: number; label: string; color: string } {
    const members = room.memberCount;
    if (members >= 10) return { bars: 4, label: "High",   color: "bg-[#a7c8b3]" };
    if (members >= 5)  return { bars: 3, label: "Medium", color: "bg-[#a7c8b3]" };
    if (members >= 2)  return { bars: 2, label: "Low",    color: "bg-zinc-500"   };
    return               { bars: 1, label: "Low",    color: "bg-zinc-600"   };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function RoomsClient({ enrichedRooms, errorParam }: Props) {
    const [rooms,       setRooms      ] = useState<EnrichedRoom[]>(enrichedRooms);
    const [search,      setSearch     ] = useState("");
    const [sort,        setSort       ] = useState("popular");
    const [activeTab,   setActiveTab  ] = useState("all");
    const [showFilters, setShowFilters] = useState(false);

    // Realtime upsert (room metadata only — no message enrichment on RT updates)
    useEffect(() => {
        const channel = `databases.${db}.collections.${discussionRoomsCollection}.documents`;
        const unsub = client.subscribe(channel, (response) => {
            const payload = response.payload as DiscussionRoom;
            const isValid = payload.status === "active" && payload.visibility === "public";

            setRooms((cur) => {
                if (response.events.some((e) => e.includes(".delete"))) {
                    return cur.filter((r) => r.$id !== payload.$id);
                }
                if (response.events.some((e) => e.includes(".create") || e.includes(".update"))) {
                    if (!isValid) return cur.filter((r) => r.$id !== payload.$id);
                    const exists = cur.some((r) => r.$id === payload.$id);
                    if (exists) {
                        return cur.map((r) =>
                            r.$id === payload.$id ? { ...r, ...payload } : r
                        );
                    }
                    return [...cur, { ...payload, onlineMembers: [], lastMessage: undefined }];
                }
                return cur;
            });
        });
        return () => unsub();
    }, []);

    // ── Derived data ──────────────────────────────────────────────────────
    const allTags = useMemo(() => {
        const counts = new Map<string, number>();
        rooms.forEach((r) => r.tags?.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t);
    }, [rooms]);

    const filtered = useMemo(() => {
        let res = [...rooms];
        // Tab filter
        if (activeTab === "live") {
            res = res.filter((r) => r.activeCodeSessionId);
        } else {
            const tab = CATEGORY_TABS.find((t) => t.id === activeTab);
            if (tab && "tag" in tab && tab.tag) {
                res = res.filter((r) => r.tags?.includes(tab.tag as string));
            }
        }
        // Search
        const q = search.trim().toLowerCase();
        if (q) {
            res = res.filter(
                (r) =>
                    r.name.toLowerCase().includes(q) ||
                    r.description?.toLowerCase().includes(q) ||
                    r.tags?.some((t) => t.toLowerCase().includes(q))
            );
        }
        // Sort
        if (sort === "newest") {
            res.sort((a, b) => new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime());
        } else if (sort === "activity") {
            res.sort(
                (a, b) =>
                    new Date(b.lastActivityAt ?? b.$createdAt).getTime() -
                    new Date(a.lastActivityAt ?? a.$createdAt).getTime()
            );
        } else {
            res.sort((a, b) => b.memberCount - a.memberCount);
        }
        return res;
    }, [rooms, search, sort, activeTab]);

    const liveRooms    = filtered.filter((r) => r.activeCodeSessionId);
    const regularRooms = filtered.filter((r) => !r.activeCodeSessionId);

    const totalOnline = rooms.reduce((s, r) => s + r.memberCount, 0);
    const liveCount   = rooms.filter((r) => r.activeCodeSessionId).length;

    return (
        <div className="space-y-6">

            {/* ── Page title + Create ──────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-zinc-100">Discussion Rooms</h1>
                    <p className="mt-1 text-sm text-zinc-500">
                        Join developers, collaborate in real-time, and solve problems together.
                    </p>
                </div>
                <Link
                    href="/rooms/create"
                    className="flex shrink-0 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-4 py-2.5 text-sm font-[600] text-[#08100b] transition-all hover:bg-white hover:shadow-[0_0_15px_rgba(167,200,179,0.4)] hover:scale-[1.02]"
                >
                    <Plus size={14} />
                    Create Room
                </Link>
            </div>

            {/* ── Error banner ─────────────────────────────────────────── */}
            {errorParam === "invalid_invite" && (
                <div className="flex items-center gap-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] px-4 py-3 text-sm text-rose-400">
                    <AlertCircle size={14} className="shrink-0" />
                    The invite link you used is invalid or has expired.
                </div>
            )}

            {/* ── Category tabs + Filter toggle ────────────────────────── */}
            <div className="flex items-center justify-between border-b border-white/[0.06]">
                <div className="flex items-center gap-0.5 overflow-x-auto">
                    {CATEGORY_TABS.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    "relative flex shrink-0 items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors",
                                    isActive ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                {tab.id === "live" && (
                                    <span className="size-1.5 rounded-full bg-rose-500 animate-pulse" />
                                )}
                                {tab.label}
                                {isActive && (
                                    <motion.div
                                        layoutId="tab-underline"
                                        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#a7c8b3]"
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
                <button
                    onClick={() => setShowFilters((v) => !v)}
                    className={cn(
                        "mb-1 flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all",
                        showFilters
                            ? "border-[#a7c8b3]/25 bg-[#a7c8b3]/10 text-[#a7c8b3]"
                            : "border-white/[0.08] bg-transparent text-zinc-500 hover:text-zinc-300"
                    )}
                >
                    <SlidersHorizontal size={13} />
                    Filters
                </button>
            </div>

            {/* ── Expanded filter panel ─────────────────────────────────── */}
            <AnimatePresence>
                {showFilters && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 sm:flex-row sm:items-start sm:justify-between">
                            {/* Search */}
                            <div className="relative flex-1">
                                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search rooms…"
                                    className="h-9 w-full rounded-lg border border-white/[0.08] bg-transparent pl-9 pr-8 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-[#a7c8b3]/30 focus:outline-none transition"
                                />
                                {search && (
                                    <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                            {/* Sort */}
                            <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.02] p-0.5">
                                {SORT_OPTIONS.map(({ value, label, icon: Icon }) => (
                                    <button
                                        key={value}
                                        onClick={() => setSort(value)}
                                        className={cn(
                                            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                                            sort === value
                                                ? "bg-[#a7c8b3]/15 text-[#a7c8b3]"
                                                : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                    >
                                        <Icon size={11} /> {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Tag cloud */}
                        {allTags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5 px-1">
                                {allTags.map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => {
                                            const matching = CATEGORY_TABS.find((tab) => "tag" in tab && tab.tag === t);
                                            setActiveTab(matching ? matching.id : "all");
                                            setSearch(search === t ? "" : t);
                                        }}
                                        className={cn(
                                            "flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all",
                                            TAG_PALETTE[t] ?? TAG_DEFAULT
                                        )}
                                    >
                                        <Hash size={9} /> {t}
                                    </button>
                                ))}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Table ────────────────────────────────────────────────── */}
            {filtered.length > 0 ? (
                <div className="space-y-8">

                    {/* Live section */}
                    {liveRooms.length > 0 && (
                        <section>
                            <div className="mb-2 flex items-center gap-2">
                                <Radio size={11} className="text-rose-500 animate-pulse" />
                                <span className="text-[10px] font-semibold uppercase tracking-widest text-[#a7c8b3]">
                                    Live Coding Sessions
                                </span>
                                <div className="h-px flex-1 bg-[#a7c8b3]/10" />
                            </div>
                            <RoomTable rooms={liveRooms} />
                        </section>
                    )}

                    {/* Regular rooms */}
                    {regularRooms.length > 0 && (
                        <section>
                            {liveRooms.length > 0 && (
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                                        All Rooms
                                    </span>
                                    <div className="h-px flex-1 bg-white/[0.05]" />
                                </div>
                            )}
                            <RoomTable rooms={regularRooms} />
                        </section>
                    )}
                </div>
            ) : (
                /* ── Empty state ── */
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-24 text-center"
                >
                    <div className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                        <MessageSquare size={24} className="text-zinc-600" />
                    </div>
                    <h3 className="text-lg font-semibold text-zinc-200">No rooms found</h3>
                    <p className="mt-1.5 max-w-xs text-sm text-zinc-500">
                        {search
                            ? `No rooms match "${search}".`
                            : activeTab !== "all"
                              ? "No rooms in this category yet."
                              : "No public rooms yet. Be the first to create one."}
                    </p>
                    <div className="mt-6 flex items-center gap-3">
                        {(search || activeTab !== "all") && (
                            <button
                                onClick={() => { setSearch(""); setActiveTab("all"); }}
                                className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm text-zinc-300 hover:bg-white/[0.08] transition"
                            >
                                <X size={13} /> Clear filters
                            </button>
                        )}
                        <Link
                            href="/rooms/create"
                            className="flex h-9 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-4 text-sm font-semibold text-[#08100b] transition hover:bg-[#a78bfa]"
                        >
                            <Plus size={14} /> Create a Room
                        </Link>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

// ─── Room Table ───────────────────────────────────────────────────────────────

function RoomTable({ rooms }: { rooms: EnrichedRoom[] }) {
    return (
        <div className="overflow-hidden rounded-xl border border-white/[0.06]">
            {/* Column headers */}
            <div className="hidden grid-cols-[1fr_160px_120px_240px_80px] items-center gap-4 border-b border-white/[0.06] bg-white/[0.02] px-5 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600 md:grid">
                <span>Room</span>
                <span className="text-center">People</span>
                <span className="text-center">Activity</span>
                <span>Last Message</span>
                <span />
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/[0.04]">
                {rooms.map((room, i) => (
                    <RoomRow key={room.$id} room={room} index={i} />
                ))}
            </div>
        </div>
    );
}

// ─── Room Row ─────────────────────────────────────────────────────────────────

function RoomRow({ room, index }: { room: EnrichedRoom; index: number }) {
    const act = activityLevel(room);
    const isLive = Boolean(room.activeCodeSessionId);
    const capacity = room.maxMembers > 0 ? room.memberCount / room.maxMembers : 0;
    const members = room.onlineMembers ?? [];

    return (
        <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, delay: index * 0.04 }}
        >
            <Link
                href={`/rooms/${room.$id}`}
                className="group flex flex-col gap-3 bg-transparent px-5 py-4 transition-colors hover:bg-white/[0.03] md:grid md:grid-cols-[1fr_160px_120px_240px_80px] md:items-center md:gap-4"
            >
                {/* ── Col 1: Room info ──────────────────────────────── */}
                <div className="flex items-start gap-3 min-w-0">
                    <div className="flex items-center gap-3 shrink-0">
                        {/* Live dot */}
                        <span
                            className={cn(
                                "size-1.5 rounded-full shrink-0",
                                isLive ? "bg-rose-500 shadow-[0_0_6px_#f43f5e]" : "bg-zinc-700"
                            )}
                        />

                        {/* Room icon (tag-based) */}
                        <div
                            className={cn(
                                "flex size-11 shrink-0 items-center justify-center rounded-xl border",
                                getRoomIconStyle(room.$id)
                            )}
                        >
                            {getRoomIcon(room.tags, room.name)}
                        </div>
                    </div>

                    <div className="min-w-0">
                        {/* Name + badges */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-[14px] font-semibold text-zinc-100 transition group-hover:text-white">
                                {room.name}
                            </span>
                            {isLive && (
                                <span className="flex items-center gap-1 rounded-sm border border-[#a7c8b3]/20 bg-[#a7c8b3]/15 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#a7c8b3]">
                                    <span className="size-1 animate-pulse rounded-full bg-rose-500" />
                                    Live
                                </span>
                            )}
                            {room.visibility === "private" && (
                                <Lock size={10} className="text-zinc-600" />
                            )}
                        </div>

                        {/* Description */}
                        <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                            {room.description || "No description provided."}
                        </p>

                        {/* Tags */}
                        {room.tags && room.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {room.tags.slice(0, 3).map((t) => (
                                    <span
                                        key={t}
                                        className={cn(
                                            "rounded-md border px-2 py-0.5 text-[10px] font-medium",
                                            TAG_PALETTE[t] ?? TAG_DEFAULT
                                        )}
                                    >
                                        {t}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Col 2: People ─────────────────────────────────── */}
                <div className="flex flex-col items-start gap-1 md:items-center">
                    {/* Avatar stack */}
                    <div className="flex items-center">
                        {room.memberCount > 0 ? (
                            <>
                                {members.slice(0, 3).map((m, idx) => (
                                    <span
                                        key={m.$id}
                                        style={{ marginLeft: idx === 0 ? 0 : -8 }}
                                        className={cn(
                                            "flex size-7 items-center justify-center rounded-full border border-[#080808] text-[10px] font-bold",
                                            getUserAvatarStyle(m.userId)
                                        )}
                                        title={m.displayName}
                                    >
                                        {getUserInitials(m.displayName)}
                                    </span>
                                ))}
                                {room.memberCount > 3 && (
                                    <span
                                        style={{ marginLeft: -8 }}
                                        className="flex size-7 items-center justify-center rounded-full border border-[#080808] bg-zinc-800 text-[10px] font-bold text-zinc-400"
                                    >
                                        +{room.memberCount - 3}
                                    </span>
                                )}
                            </>
                        ) : (
                            <span className="text-[12px] text-zinc-600">—</span>
                        )}
                    </div>
                    <span className={cn(
                        "text-[11px]",
                        room.memberCount >= 1 ? "text-[#a7c8b3] font-medium" : "text-zinc-600"
                    )}>
                        {room.memberCount} online
                    </span>
                </div>

                {/* ── Col 3: Activity bars ──────────────────────────── */}
                <div className="flex flex-col items-start gap-1 md:items-center">
                    <ActivityBars level={act.bars} color={act.color} />
                    <span className="text-[11px] text-zinc-500">{act.label}</span>
                </div>

                {/* ── Col 4: Last message ───────────────────────────── */}
                <div className="min-w-0">
                    {room.lastMessage ? (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className="text-[12px] font-semibold text-zinc-300 truncate">
                                    {room.lastMessage.authorName}
                                </span>
                                <span className="shrink-0 text-[10px] text-zinc-600">
                                    {relTime(room.lastMessage.$createdAt)}
                                </span>
                            </div>
                            <p className="mt-0.5 line-clamp-1 text-[12px] text-zinc-500">
                                {room.lastMessage.type === "code"
                                    ? "📎 Shared a code snippet"
                                    : room.lastMessage.body}
                            </p>
                        </>
                    ) : (
                        <span className="text-[12px] text-zinc-700 italic">No messages yet</span>
                    )}
                </div>

                {/* ── Col 5: Join CTA ───────────────────────────────── */}
                <div className="flex md:justify-end">
                    <span className="flex items-center gap-1 rounded-lg bg-[#a7c8b3] px-4 py-1.5 text-xs font-[600] text-[#08100b] transition-all group-hover:bg-white group-hover:shadow-[0_0_15px_rgba(167,200,179,0.4)] group-hover:scale-[1.02]">
                        Join <ChevronRight size={12} />
                    </span>
                </div>
            </Link>
        </motion.div>
    );
}

// ─── Activity bars (like signal strength) ─────────────────────────────────────

function ActivityBars({ level, color }: { level: number; color: string }) {
    return (
        <div className="flex items-end gap-0.5">
            {[1, 2, 3, 4].map((bar) => (
                <div
                    key={bar}
                    className={cn(
                        "w-1.5 rounded-sm transition-all",
                        bar <= level ? color : "bg-zinc-800"
                    )}
                    style={{ height: `${6 + bar * 4}px` }}
                />
            ))}
        </div>
    );
}

// ─── Room icon helpers ────────────────────────────────────────────────────────

function getRoomIconStyle(seed: string): string {
    return "border-white/[0.08] bg-white/[0.03] text-zinc-400";
}

const VALID_SKILL_ICONS = new Set([
    "ableton", "activitypub", "actix", "adonis", "ae", "aiscript", "alpinejs", "anaconda", "android", "angular", "ansible", "apollo", "apple", "appwrite", "arch", "arduino", "astro", "atom", "au", "autocad", "aws", "azure", "babel", "bash", "bevy", "bitbucket", "blender", "bootstrap", "bsd", "c", "cs", "cpp", "crystal", "cassandra", "clojure", "cloudflare", "cmake", "codepen", "coffeescript", "css", "cypress", "d3", "dart", "debian", "deno", "devto", "discord", "django", "docker", "dotnet", "dynamodb", "eclipse", "elasticsearch", "electron", "elixir", "elysia", "emacs", "ember", "emotion", "express", "fastapi", "figma", "firebase", "flask", "flutter", "forth", "fortran", "fsharp", "gatsby", "gcp", "gitea", "git", "github", "githubactions", "gitlab", "gmail", "godot", "golang", "go", "graphql", "gtk", "gulp", "haskell", "haxe", "heroku", "hibernate", "html", "htmx", "idea", "ig", "illustrator", "insomnia", "instagram", "ipfs", "java", "js", "javascript", "jenkins", "jest", "jquery", "kafka", "kali", "kotlin", "ktor", "kubernetes", "k8s", "laravel", "latex", "less", "linkedin", "linux", "lit", "lua", "md", "mastodon", "materialize", "matlab", "maven", "mint", "mongodb", "mongo", "mysql", "neovim", "nestjs", "netlify", "nextjs", "nginx", "nim", "nix", "nodejs", "node", "npm", "nuxt", "ocaml", "octave", "opencv", "openshift", "openstack", "p5js", "perl", "photoshop", "php", "pinia", "plan9", "planetscale", "pnpm", "postgres", "postgresql", "postman", "powershell", "pr", "prisma", "processing", "prometheus", "pug", "puppeteer", "purescript", "py", "python", "pytorch", "qt", "r", "rabbitmq", "rails", "raspberrypi", "react", "reactivex", "redhat", "redis", "redux", "regex", "remix", "replit", "rollup", "ros", "ruby", "rust", "sass", "scala", "scikit", "scss", "selenium", "sentry", "sequelize", "sketch", "sklearn", "solidjs", "sololearn", "spring", "sqlite", "stackoverflow", "styledcomponents", "stylus", "svelte", "svg", "swift", "symfony", "tailwind", "tailwindcss", "tauri", "tensorflow", "terraform", "threejs", "ts", "typescript", "ubuntu", "unity", "unreal", "v", "vala", "vercel", "vim", "visualstudio", "vite", "vscode", "vue", "vuetify", "wasm", "webflow", "webpack", "webstorm", "windicss", "windows", "wordpress", "workers", "xd", "yarn", "yew", "zig"
]);

function getRoomIcon(tags: string[] | undefined, name: string) {
    let primary = "";
    if (tags && tags.length > 0) {
        primary = tags[0].toLowerCase();
    } else if (name) {
        primary = name.trim().split(/\s+/)[0].toLowerCase();
    }
    
    if (!primary) return <Terminal size={20} strokeWidth={1.5} />;
    
    // Clean string for skillicons matching (e.g., "next.js" -> "nextjs")
    const clean = primary.replace(/[^a-z0-9]/g, "");
    
    let skill = VALID_SKILL_ICONS.has(clean) ? clean : "";
    if (!skill) {
        if (clean === "vuejs") skill = "vue";
        else if (clean === "cplusplus") skill = "cpp";
        else if (clean === "csharp") skill = "cs";
        else if (primary === "c++") skill = "cpp";
        else if (primary === "c#") skill = "cs";
    }

    if (skill) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img 
                src={`https://skillicons.dev/icons?i=${skill}&theme=dark`} 
                alt={primary} 
                className="size-6 rounded-sm" 
            />
        );
    }

    if (["react", "next.js", "vue", "frontend", "ui", "tailwind", "tailwindcss"].includes(primary)) return <Layout size={20} strokeWidth={1.5} />;
    if (["javascript", "typescript", "python", "rust", "golang", "java", "cpp", "node"].includes(primary)) return <Code2 size={20} strokeWidth={1.5} />;
    if (["aws", "devops", "docker", "kubernetes", "cloud"].includes(primary)) return <Cloud size={20} strokeWidth={1.5} />;
    if (["sql", "mongodb", "postgres", "database", "redis"].includes(primary)) return <Database size={20} strokeWidth={1.5} />;
    if (["system design", "architecture", "backend", "system-design"].includes(primary)) return <Cpu size={20} strokeWidth={1.5} />;
    
    return <Terminal size={20} strokeWidth={1.5} />;
}

// ─── Re-export tag palette so page can use it if needed ──────────────────────
export { TAG_PALETTE, TAG_DEFAULT };
