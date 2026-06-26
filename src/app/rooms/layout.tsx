import React from "react";

/**
 * This layout only wraps /rooms/[id], /rooms/create, /rooms/join/[token] —
 * those are full-screen experiences that intentionally skip TopNav + sidebar.
 *
 * The /rooms directory page lives in src/app/(main)/rooms/page.tsx so it
 * inherits the main layout (TopNav + DesktopSidebar + MobileNav) automatically.
 */
export default function RoomsSessionLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
