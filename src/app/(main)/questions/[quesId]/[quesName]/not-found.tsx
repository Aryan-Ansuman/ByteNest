import Link from "next/link";
import { MessageCircleOff, ArrowLeft, Search } from "lucide-react";

export default function QuestionNotFound() {
    return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
            <div className="mb-6 flex size-20 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
                <MessageCircleOff className="size-9 text-zinc-500" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-100 sm:text-4xl">
                Question not found
            </h1>
            <p className="mt-3 max-w-md text-base text-zinc-400">
                This question may have been deleted, or the link might be incorrect.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                    href="/questions"
                    className="flex h-11 items-center gap-2 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-6 text-sm font-semibold text-[#08100b] transition hover:bg-[#b4d6bf]"
                >
                    <Search className="size-4" />
                    Browse questions
                </Link>
                <Link
                    href="/"
                    className="flex h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-6 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                >
                    <ArrowLeft className="size-4" />
                    Go home
                </Link>
            </div>
        </div>
    );
}
