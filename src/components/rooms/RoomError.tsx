"use client";

import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function RoomError({ message }: { message: string }) {
    return (
        <div className="flex h-screen items-center justify-center bg-[#080808] text-zinc-100">
            <div className="text-center space-y-4 max-w-sm">
                <div className="mx-auto w-12 h-12 rounded-full bg-rose-500/15 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6 text-rose-400" />
                </div>
                <p className="text-rose-400 font-medium text-sm">{message}</p>
                <Link
                    href="/rooms"
                    className="inline-block text-sm text-zinc-500 hover:text-zinc-300 underline underline-offset-4 transition-colors"
                >
                    Back to rooms
                </Link>
            </div>
        </div>
    );
}
