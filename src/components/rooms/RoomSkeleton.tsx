"use client";

export default function RoomSkeleton() {
    return (
        <div className="flex flex-col h-screen bg-[#09090b] animate-pulse">
            {/* Header skeleton */}
            <div className="h-14 bg-[#09090b] border-b border-white/5 flex items-center px-6 gap-3">
                <div className="w-8 h-8 rounded-[12px] bg-white/5" />
                <div className="h-4 w-32 rounded-md bg-white/5" />
            </div>

            {/* Body skeleton */}
            <div className="flex flex-1 overflow-hidden">
                {/* Chat skeleton */}
                <div className="w-[280px] bg-[#111113] border-r border-white/5 p-4 space-y-5 flex flex-col justify-end pb-24">
                    {[65, 42, 78, 55].map((width, i) => (
                        <div key={i} className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-white/5 shrink-0" />
                            <div className="space-y-2 flex-1 pt-1">
                                <div className="h-3 w-20 rounded bg-white/5" />
                                <div
                                    className="h-3 rounded bg-white/5"
                                    style={{ width: `${width}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Editor skeleton */}
                <div className="flex-1 bg-[#09090b] p-6 space-y-3">
                    <div className="h-4 w-48 rounded bg-white/5" />
                    <div className="h-4 w-64 rounded bg-white/5" />
                    <div className="h-4 w-32 rounded bg-white/5" />
                </div>
            </div>
        </div>
    );
}
