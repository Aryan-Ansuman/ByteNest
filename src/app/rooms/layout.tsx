import React from "react";

/**
 * Rooms have their own full-screen layout — no TopNav, no sidebar.
 * The room page itself manages its own header and three-column layout.
 */
export default function RoomsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
