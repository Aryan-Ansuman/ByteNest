"use client";

import React from "react";
import { Check, Copy, ExternalLink, Mail, Share2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function ShareMenu({
    getUrl,
    title,
    text,
    disabled = false,
    variant = "button",
    align = "right",
}: {
    getUrl: () => string;
    title: string;
    text?: string;
    disabled?: boolean;
    variant?: "button" | "inline";
    align?: "left" | "right";
}) {
    const [open, setOpen] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const ref = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!open) return;
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", closeOnOutsideClick);
        document.addEventListener("keydown", closeOnEscape);
        return () => {
            document.removeEventListener("mousedown", closeOnOutsideClick);
            document.removeEventListener("keydown", closeOnEscape);
        };
    }, [open]);

    React.useEffect(() => {
        if (disabled) setOpen(false);
    }, [disabled]);

    const url = open ? getUrl() : "";

    const handleNativeShare = async () => {
        if (!navigator.share) return;
        try {
            await navigator.share({ title, text, url: getUrl() });
            setOpen(false);
        } catch (error: any) {
            if (error?.name !== "AbortError") toast.error("Could not open the share sheet");
        }
    };

    const handleCopy = async () => {
        try {
            await copyText(getUrl());
            setCopied(true);
            toast.success("Link copied");
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error("Could not copy the link");
        }
    };

    const openExternal = (href: string) => {
        window.open(href, "_blank", "noopener,noreferrer");
        setOpen(false);
    };

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={open}
                className={cn(
                    "transition disabled:cursor-not-allowed disabled:opacity-50",
                    variant === "button"
                        ? "inline-flex h-9 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] font-medium text-zinc-300 hover:bg-white/[0.06]"
                        : "flex items-center gap-2 text-[13px] font-medium text-zinc-500 hover:text-zinc-300"
                )}
            >
                <Share2 className="size-4" />
                Share
            </button>

            {open && (
                <div
                    role="menu"
                    className={cn(
                        "absolute top-10 z-50 w-48 overflow-hidden rounded-lg border border-white/10 bg-[#0c0c0c]/98 py-1 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur-xl",
                        align === "right" ? "right-0" : "left-0"
                    )}
                >
                    {typeof navigator !== "undefined" && typeof navigator.share === "function" && (
                        <ShareItem icon={<Share2 className="size-3.5" />} onClick={handleNativeShare}>
                            Share via device
                        </ShareItem>
                    )}
                    <ShareItem
                        icon={copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        onClick={handleCopy}
                    >
                        {copied ? "Copied" : "Copy link"}
                    </ShareItem>
                    <ShareItem
                        icon={<ExternalLink className="size-3.5" />}
                        onClick={() =>
                            openExternal(
                                `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
                            )
                        }
                    >
                        LinkedIn
                    </ShareItem>
                    <ShareItem
                        icon={<ExternalLink className="size-3.5" />}
                        onClick={() =>
                            openExternal(
                                `https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`
                            )
                        }
                    >
                        X
                    </ShareItem>
                    <ShareItem
                        icon={<Mail className="size-3.5" />}
                        onClick={() => {
                            window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(
                                `${text ? `${text}\n\n` : ""}${url}`
                            )}`;
                            setOpen(false);
                        }}
                    >
                        Email
                    </ShareItem>
                </div>
            )}
        </div>
    );
}

function ShareItem({
    icon,
    onClick,
    children,
}: {
    icon: React.ReactNode;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-100"
        >
            {icon}
            {children}
        </button>
    );
}

export async function copyText(value: string) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy command failed");
}
