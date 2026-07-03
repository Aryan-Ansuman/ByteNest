"use client";

import { MessageSquare, Code2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileTab = "chat" | "code" | "members";

interface Props {
    active: MobileTab;
    onChange: (tab: MobileTab) => void;
    hasCodeSession: boolean;
    unreadCount?: number;
    onlineCount?: number;
}

export default function MobileTabBar({
    active,
    onChange,
    hasCodeSession,
    unreadCount = 0,
    onlineCount,
}: Props) {
    const tabs: { id: MobileTab; label: string; Icon: React.ElementType; badge?: number }[] = [
        { id: "chat",    label: "Chat",    Icon: MessageSquare, badge: unreadCount },
        { id: "code",    label: "Code",    Icon: Code2 },
        { id: "members", label: "Members", Icon: Users, badge: onlineCount },
    ];

    return (
        <nav
            className="md:hidden shrink-0 flex items-stretch h-14 bg-[#0c0c0e] border-t border-white/[0.06] pb-[env(safe-area-inset-bottom)]"
            aria-label="Room sections"
        >
            {tabs.map(({ id, label, Icon, badge }) => {
                const isActive = active === id;
                const disabled = id === "code" && !hasCodeSession;
                return (
                    <button
                        key={id}
                        onClick={() => !disabled && onChange(id)}
                        disabled={disabled}
                        className={cn(
                            "flex-1 flex flex-col items-center justify-center gap-1 relative transition-colors",
                            disabled
                                ? "text-zinc-700"
                                : isActive
                                ? "text-[#a7c8b3]"
                                : "text-zinc-500 active:text-zinc-300"
                        )}
                        aria-current={isActive ? "page" : undefined}
                    >
                        {isActive && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] bg-[#a7c8b3] rounded-full shadow-[0_1px_6px_rgba(167,200,179,0.4)]" />
                        )}
                        <div className="relative">
                            <Icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.8} />
                            {Boolean(badge) && badge! > 0 && (
                                <span className="absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-[3px] rounded-full bg-[#a7c8b3] text-[#08100b] text-[9px] font-bold flex items-center justify-center">
                                    {badge! > 9 ? "9+" : badge}
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] font-medium tracking-tight">{label}</span>
                    </button>
                );
            })}
        </nav>
    );
}
