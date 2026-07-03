"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BadgeCheck, ExternalLink, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import { useAuthStore } from "@/store/Auth";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";
import { cn } from "@/lib/utils";

type AnswerOutdatedPayload = {
    answerId: string;
    questionId: string;
    questionTitle?: string;
    answerSnippet?: string;
    techPackage?: string | null;
    versionMax?: string | null;
    latestVersion?: string | null;
    latestReleaseDate?: string | null;
    reportedCount?: number;
    freshnessLabel?: "outdated" | "stale";
};

type NotificationDoc = {
    $id: string;
    type: "answer_outdated";
    payload: AnswerOutdatedPayload;
    readAt: string | null;
    createdAt: string;
};

export default function NotificationBell() {
    const router = useRouter();
    const { session } = useAuthStore();
    const [open, setOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [notifications, setNotifications] = React.useState<NotificationDoc[]>([]);
    const [unreadCount, setUnreadCount] = React.useState(0);
    const [reviewingId, setReviewingId] = React.useState<string | null>(null);
    const [markingAll, setMarkingAll] = React.useState(false);
    const hasFetchedRef = React.useRef(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const loadNotifications = React.useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiFetch<{ data: { notifications: NotificationDoc[]; unreadCount: number } }>(
                "/api/notifications"
            );
            setNotifications(res.data.notifications);
            setUnreadCount(res.data.unreadCount);
        } catch {
            // Silent — the bell just stays at its last-known count rather than erroring in the header.
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        if (!session || hasFetchedRef.current) return;
        hasFetchedRef.current = true;
        loadNotifications();
    }, [session, loadNotifications]);

    React.useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, []);

    function markReadLocally(notificationId: string) {
        setNotifications((prev) =>
            prev.map((n) => (n.$id === notificationId ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
    }

    function answerUrl(payload: AnswerOutdatedPayload) {
        const slug = slugify(payload.questionTitle || "answer");
        return `/questions/${payload.questionId}/${slug}#answer-${payload.answerId}`;
    }

    async function handleViewAnswer(notification: NotificationDoc) {
        setOpen(false);
        if (!notification.readAt) {
            markReadLocally(notification.$id);
            apiFetch(`/api/notifications/${notification.$id}/read`, { method: "PATCH" }).catch(() => {});
        }
        router.push(answerUrl(notification.payload));
    }

    async function handleMarkReviewed(notification: NotificationDoc) {
        if (reviewingId) return;
        setReviewingId(notification.$id);
        try {
            await apiFetch(`/api/answer/${notification.payload.answerId}/still-valid`, { method: "POST" });
            if (!notification.readAt) {
                markReadLocally(notification.$id);
                await apiFetch(`/api/notifications/${notification.$id}/read`, { method: "PATCH" }).catch(() => {});
            }
            toast.success("Marked as still valid");
        } catch (error: any) {
            toast.error(error?.message ?? "Couldn't update this answer");
        } finally {
            setReviewingId(null);
        }
    }

    async function handleMarkAllRead() {
        if (markingAll || unreadCount === 0) return;
        setMarkingAll(true);
        try {
            await apiFetch("/api/notifications/mark-all-read", { method: "POST" });
            setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
            setUnreadCount(0);
        } catch (error: any) {
            toast.error(error?.message ?? "Couldn't mark notifications as read");
        } finally {
            setMarkingAll(false);
        }
    }

    if (!session) return null;

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => {
                    setOpen((v) => !v);
                    if (!hasFetchedRef.current) {
                        hasFetchedRef.current = true;
                        loadNotifications();
                    }
                }}
                aria-label="Notifications"
                className="relative flex size-10 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
            >
                <Bell className="size-[18px]" />
                {unreadCount > 0 && (
                    <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {open && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setOpen(false)}
                            className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px] sm:hidden"
                        />
                        <motion.div
                            initial={{ opacity: 0, y: -8, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.97 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="fixed inset-x-3 top-16 z-[100] max-h-[70vh] overflow-hidden rounded-2xl border border-white/5 bg-[#0c0c0c] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.6)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[380px]"
                        >
                            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                                <h3 className="text-sm font-semibold text-zinc-100">Notifications</h3>
                                <div className="flex items-center gap-3">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={handleMarkAllRead}
                                            disabled={markingAll}
                                            className="text-xs font-medium text-[#a7c8b3] transition hover:text-[#c6e2cf] disabled:opacity-50"
                                        >
                                            {markingAll ? "Marking…" : "Mark all read"}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setOpen(false)}
                                        className="flex size-6 items-center justify-center rounded-lg text-zinc-600 transition hover:bg-white/[0.06] hover:text-zinc-300"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[calc(70vh-48px)] overflow-y-auto">
                                {loading && notifications.length === 0 ? (
                                    <div className="flex items-center justify-center py-10 text-zinc-600">
                                        <Loader2 className="size-4 animate-spin" />
                                    </div>
                                ) : notifications.length === 0 ? (
                                    <p className="px-4 py-10 text-center text-sm text-zinc-600">
                                        You&apos;re all caught up.
                                    </p>
                                ) : (
                                    <ul className="divide-y divide-white/5">
                                        {notifications.map((notification) => (
                                            <li
                                                key={notification.$id}
                                                className={cn(
                                                    "px-4 py-3 transition hover:bg-white/[0.03]",
                                                    !notification.readAt && "bg-[#CFE8D5]/[0.03]"
                                                )}
                                            >
                                                <NotificationRow
                                                    notification={notification}
                                                    onView={() => handleViewAnswer(notification)}
                                                    onMarkReviewed={() => handleMarkReviewed(notification)}
                                                    isReviewing={reviewingId === notification.$id}
                                                />
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

function NotificationRow({
    notification,
    onView,
    onMarkReviewed,
    isReviewing,
}: {
    notification: NotificationDoc;
    onView: () => void;
    onMarkReviewed: () => void;
    isReviewing: boolean;
}) {
    const { payload } = notification;

    const releaseAge = payload.latestReleaseDate
        ? convertDateToRelativeTime(new Date(payload.latestReleaseDate))
        : null;

    const reportedLine =
        payload.reportedCount && payload.reportedCount > 0
            ? ` ${payload.reportedCount} user${payload.reportedCount === 1 ? "" : "s"} also reported it no longer works.`
            : "";

    const message = payload.techPackage
        ? `Your ${payload.techPackage} answer may need updating${
              payload.latestVersion ? ` — ${payload.latestVersion} released${releaseAge ? ` ${releaseAge}` : ""}` : ""
          }.${reportedLine}`
        : `Your answer may need updating.${reportedLine}`;

    return (
        <div>
            {!notification.readAt && (
                <span className="mb-1 inline-block size-1.5 rounded-full bg-[#CFE8D5]" />
            )}
            <p className="text-[13px] leading-snug text-zinc-300">{message}</p>
            {payload.questionTitle && (
                <p className="mt-1 truncate text-xs text-zinc-600">{payload.questionTitle}</p>
            )}
            <p className="mt-0.5 text-[11px] text-zinc-700">
                {convertDateToRelativeTime(new Date(notification.createdAt))}
            </p>

            <div className="mt-2 flex items-center gap-3">
                <button
                    onClick={onView}
                    className="flex items-center gap-1 text-xs font-medium text-[#a7c8b3] transition hover:text-[#c6e2cf]"
                >
                    <ExternalLink className="size-3" />
                    View answer
                </button>
                <button
                    onClick={onMarkReviewed}
                    disabled={isReviewing}
                    className="flex items-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-zinc-300 disabled:opacity-50"
                >
                    {isReviewing ? <Loader2 className="size-3 animate-spin" /> : <BadgeCheck className="size-3" />}
                    {isReviewing ? "Confirming…" : "Mark as reviewed"}
                </button>
            </div>
        </div>
    );
}
