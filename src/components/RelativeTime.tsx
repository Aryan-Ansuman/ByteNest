"use client";

import { useEffect, useState } from "react";

export function relTime(dateStr?: string): string {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1)  return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

export function RelativeTime({ dateStr, className }: { dateStr?: string; className?: string }) {
    const [time, setTime] = useState(relTime(dateStr));

    useEffect(() => {
        setTime(relTime(dateStr));
        const interval = setInterval(() => {
            setTime(relTime(dateStr));
        }, 60000); // Update every minute
        return () => clearInterval(interval);
    }, [dateStr]);

    if (!dateStr) return null;
    return <span className={className}>{time}</span>;
}
