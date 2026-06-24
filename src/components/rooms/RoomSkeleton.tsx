"use client";

export default function RoomSkeleton() {
    return (
        <div className="flex flex-col h-screen bg-[#080808] animate-pulse">
            {/* Header skeleton */}
            <div className="h-14 bg-[#0a0a0a] border-b border-zinc-800 flex items-center px-4 gap-3">
                <div className="w-4 h-4 rounded bg-zinc-800" />
                <div className="h-4 w-px bg-zinc-800" />
                <div className="h-4 w-32 rounded bg-zinc-800" />
            </div>

            {/* Body skeleton */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar skeleton */}
                <div className="w-[220px] bg-[#0a0a0a] border-r border-zinc-800 p-3 space-y-3">
                    <div className="h-3 w-20 rounded bg-zinc-800" />
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-zinc-800" />
                            <div className="h-3 flex-1 rounded bg-zinc-800" />
                        </div>
                    ))}
                </div>

                {/* Chat skeleton */}
                <div className="flex-1 p-4 space-y-4">
                    {[65, 42, 78, 55, 82, 49].map((width, i) => (
                        <div key={i} className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-full bg-zinc-800 shrink-0" />
                            <div className="space-y-2 flex-1">
                                <div className="h-3 w-24 rounded bg-zinc-800" />
                                <div
                                    className="h-3 rounded bg-zinc-800"
                                    style={{ width: `${width}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
