"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/Auth";
import {
    IconBrandGithub,
    IconBrandGoogle,
    IconCode,
    IconMessageQuestion,
    IconBook2,
    IconBolt,
    IconEye,
    IconEyeOff,
    IconMail,
    IconLock,
    IconCheck,
    IconArrowRight,
    IconUsersGroup,
    IconAlertCircle,
} from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Login() {
    const { login } = useAuthStore();
    const router = useRouter();
    const [isLoading, setIsLoading] = React.useState(false);
    const [error, setError] = React.useState("");
    const [showPassword, setShowPassword] = React.useState(false);
    const [rememberMe, setRememberMe] = React.useState(false);
    const [email, setEmail] = React.useState("");
    const [password, setPassword] = React.useState("");

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (!email || !password) {
            setError("Please fill out all fields");
            return;
        }

        setIsLoading(true);
        setError("");

        const loginResponse = await login(email, password);
        if (loginResponse.error) {
            setError(loginResponse.error.message);
        } else {
            router.push("/");
        }

        setIsLoading(false);
    };

    return (
        <div className="flex h-screen overflow-hidden bg-[#080808] text-zinc-100 selection:bg-[#a7c8b3]/30">
            {/* ── Left Panel (Marketing) ── */}
            <div className="relative hidden w-full max-w-2xl flex-col bg-black bg-[url('/images/login-hero.png')] bg-cover bg-center bg-no-repeat lg:flex border-r border-white/5">
                {/* Overlay for text readability */}
                <div className="absolute inset-0 bg-black/60 pointer-events-none" />
                
                {/* Subtle background glow */}
                <div className="absolute top-1/4 -left-1/4 h-[500px] w-[500px] rounded-full bg-[#a7c8b3]/20 blur-[120px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-0 h-[400px] w-[400px] rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />
                
                {/* Content */}
                <div className="relative flex flex-1 flex-col p-12 lg:px-16 xl:px-24">
                    {/* Logo */}
                    <Link href="/" className="flex w-fit items-center gap-3 transition-opacity hover:opacity-80">
                        <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                            <IconCode size={20} className="text-[#a7c8b3]" />
                        </div>
                        <span className="text-xl font-bold tracking-tight text-white">
                            ByteNest
                        </span>
                    </Link>

                    <div className="flex flex-1 flex-col justify-center">
                        <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-[#a7c8b3]/20 bg-[#a7c8b3]/10 px-3 py-1 text-sm font-medium text-[#a7c8b3]">
                            <IconUsersGroup size={16} />
                            A community for developers
                        </div>

                        <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-100 xl:text-5xl">
                            Where developers <br />
                            <span className="text-white">ask</span>,{" "}
                            <span className="text-white">share</span>, and{" "}
                            <span className="bg-gradient-to-r from-[#a7c8b3] to-emerald-400 bg-clip-text text-transparent">grow</span>
                        </h1>

                        <p className="mt-6 max-w-md text-lg leading-relaxed text-zinc-400">
                            Join a community of curious minds. Ask questions, share knowledge, and build your reputation.
                        </p>

                        <div className="mt-12 space-y-8">
                            <Feature
                                icon={<IconMessageQuestion size={22} className="text-blue-400" />}
                                title="Ask questions"
                                description="Get help and answers from experts"
                                bg="bg-blue-500/10"
                                border="border-blue-500/20"
                            />
                            <Feature
                                icon={<IconBook2 size={22} className="text-[#a7c8b3]" />}
                                title="Share knowledge"
                                description="Help others and build your reputation"
                                bg="bg-[#a7c8b3]/10"
                                border="border-[#a7c8b3]/20"
                            />
                            <Feature
                                icon={<IconBolt size={22} className="text-amber-400" />}
                                title="Grow together"
                                description="Learn, collaborate, and level up"
                                bg="bg-amber-500/10"
                                border="border-amber-500/20"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-zinc-500">
                        <IconCheck size={16} className="text-[#a7c8b3]" />
                        A safe and respectful space for everyone.
                    </div>
                </div>
            </div>

            {/* ── Right Panel (Form) ── */}
            <div className="flex flex-1 flex-col overflow-y-auto">
                <div className="flex min-h-full flex-col items-center py-12 px-6 sm:px-12 lg:px-16">
                    <div className="my-auto w-full max-w-sm">
                        {/* Mobile Logo */}
                        <div className="mb-12 flex items-center justify-center lg:hidden">
                            <Link href="/" className="flex items-center gap-3">
                                <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                                    <IconCode size={20} className="text-[#a7c8b3]" />
                                </div>
                                <span className="text-xl font-bold tracking-tight text-white">
                                    ByteNest
                                </span>
                            </Link>
                        </div>

                        <div className="text-center lg:text-left">
                        <h2 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                            Welcome back
                        </h2>
                        <p className="mt-2 text-sm text-zinc-500">
                            Login to your ByteNest account
                        </p>
                    </div>

                    {/* Social Login Buttons */}
                    <div className="mt-8 flex flex-col gap-3">
                        <button
                            type="button"
                            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                        >
                            <IconBrandGithub size={18} />
                            Continue with GitHub
                        </button>
                        <button
                            type="button"
                            className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-zinc-100"
                        >
                            <IconBrandGoogle size={18} className="text-red-400" />
                            Continue with Google
                        </button>
                    </div>

                    <div className="my-8 flex items-center gap-4">
                        <div className="h-px flex-1 bg-white/10" />
                        <span className="text-xs uppercase tracking-widest text-zinc-600">or</span>
                        <div className="h-px flex-1 bg-white/10" />
                    </div>

                    <AnimatePresence mode="wait">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400"
                            >
                                <IconAlertCircle size={18} className="shrink-0 mt-0.5" />
                                {error}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-zinc-400">Email Address</label>
                            <div className="relative">
                                <IconMail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <Input
                                    type="email"
                                    placeholder="you@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-4 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-zinc-400">Password</label>
                            <div className="relative">
                                <IconLock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-10 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                    disabled={isLoading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <IconEye size={18} /> : <IconEyeOff size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                            <label className="flex items-center gap-2 cursor-pointer text-zinc-400 hover:text-zinc-300">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={() => setRememberMe(!rememberMe)}
                                    className="size-4 rounded border-white/20 bg-white/[0.04] text-[#a7c8b3] focus:ring-[#a7c8b3]/30 focus:ring-offset-0 focus:ring-offset-transparent"
                                />
                                Remember me
                            </label>
                            <Link href="/forgot-password" className="text-[#a7c8b3] hover:underline">
                                Forgot password?
                            </Link>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="h-11 w-full rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] font-semibold text-[#08100b] shadow-none transition-colors hover:bg-[#b4d6bf]"
                        >
                            {isLoading ? "Logging in..." : "Login"}
                            {!isLoading && <IconArrowRight size={18} className="ml-2" />}
                        </Button>
                    </form>

                    <p className="mt-8 text-center text-sm text-zinc-500">
                        Don&apos;t have an account?{" "}
                        <Link href="/register" className="font-medium text-[#a7c8b3] hover:underline">
                            Sign up
                        </Link>
                    </p>

                    <p className="mt-8 text-center text-xs text-zinc-600 lg:text-left">
                        By continuing, you agree to our{" "}
                        <Link href="/terms" className="underline hover:text-zinc-400">Terms of Service</Link> and{" "}
                        <Link href="/privacy" className="underline hover:text-zinc-400">Privacy Policy</Link>.
                    </p>
                </div>
                </div>
            </div>
        </div>
    );
}

function Feature({
    icon,
    title,
    description,
    bg,
    border,
}: {
    icon: React.ReactNode;
    title: string;
    description: string;
    bg: string;
    border: string;
}) {
    return (
        <div className="flex items-start gap-4">
            <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl border ${bg} ${border}`}>
                {icon}
            </div>
            <div>
                <h3 className="font-semibold text-zinc-200">{title}</h3>
                <p className="mt-1 text-sm text-zinc-500">{description}</p>
            </div>
        </div>
    );
}
