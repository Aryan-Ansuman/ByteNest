import React from "react";
import TopNav from "@/components/layout/TopNav";
import DesktopSidebar from "@/components/layout/DesktopSidebar";
import MobileNav from "@/components/layout/MobileNav";

export default function MainLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-[#080808] text-zinc-100">
            <TopNav />
            <div className="mx-auto flex max-w-[1600px]">
                <DesktopSidebar />
                <main className="w-full px-4 pb-20 pt-8 md:px-8 lg:ml-60 lg:px-12">
                    <div className="mx-auto w-full max-w-7xl">
                        {children}
                    </div>
                </main>
            </div>
            <MobileNav />
        </div>
    );
}
