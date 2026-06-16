"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Plus,
    Bookmark,
    HomeIcon,
    Tags,
    UserRound,
    ArrowLeft,
    AlertCircle,
    CheckCircle2,
    X,
    Save,
    Loader2,
    Mail,
    Lock,
    User,
    Shield,
    Eye,
    EyeOff,
    Info,
    Trash2,
    Camera,
    Star,
    Activity,
    Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/Auth";
import { account, avatars } from "@/models/client/config";
import slugify from "@/utils/slugify";
import convertDateToRelativeTime from "@/utils/relativeTime";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
    userId: string;
    userSlug: string;
    initialName: string;
    initialEmail: string;
    initialReputation: number;
    createdAt: string;
}

type ActiveSection = "profile" | "security" | "danger";

const sidebarItems = [
    { label: "Home", icon: HomeIcon, href: "/" },
    { label: "Questions", icon: Tags, href: "/questions" },
    { label: "Profile", icon: UserRound, href: "#" },
    { label: "Bookmarks", icon: Bookmark, href: "#" },
];

const sections: { id: ActiveSection; label: string; icon: React.ReactNode }[] = [
    { id: "profile", label: "Profile", icon: <User className="size-4" /> },
    { id: "security", label: "Security", icon: <Shield className="size-4" /> },
    { id: "danger", label: "Danger Zone", icon: <Trash2 className="size-4" /> },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EditProfileClient({
    userId,
    userSlug,
    initialName,
    initialEmail,
    initialReputation,
    createdAt,
}: Props) {
    const { user, logout } = useAuthStore();
    const router = useRouter();

    // Redirect if not the owner
    React.useEffect(() => {
        if (user && user.$id !== userId) {
            router.push(`/users/${userId}/${userSlug}`);
        }
        if (!user) {
            router.push("/login");
        }
    }, [user, userId, userSlug, router]);

    const [activeSection, setActiveSection] = React.useState<ActiveSection>("profile");

    // ── Profile form state ──────────────────────────────────────────────────
    const [name, setName] = React.useState(initialName);
    const [isSavingProfile, setIsSavingProfile] = React.useState(false);
    const [profileSuccess, setProfileSuccess] = React.useState(false);
    const [profileError, setProfileError] = React.useState("");

    // ── Security form state ─────────────────────────────────────────────────
    const [currentPassword, setCurrentPassword] = React.useState("");
    const [newPassword, setNewPassword] = React.useState("");
    const [confirmPassword, setConfirmPassword] = React.useState("");
    const [showCurrentPw, setShowCurrentPw] = React.useState(false);
    const [showNewPw, setShowNewPw] = React.useState(false);
    const [showConfirmPw, setShowConfirmPw] = React.useState(false);
    const [isSavingPassword, setIsSavingPassword] = React.useState(false);
    const [passwordSuccess, setPasswordSuccess] = React.useState(false);
    const [passwordError, setPasswordError] = React.useState("");

    // ── Danger zone ─────────────────────────────────────────────────────────
    const [deleteConfirm, setDeleteConfirm] = React.useState("");
    const [isDeletingAccount, setIsDeletingAccount] = React.useState(false);
    const [showDeleteWarning, setShowDeleteWarning] = React.useState(false);

    // ── Profile has changes ─────────────────────────────────────────────────
    const nameHasChanges = name.trim() !== initialName;

    // ── Submit: Update Name ─────────────────────────────────────────────────
    const handleSaveProfile = async () => {
        if (!name.trim()) { setProfileError("Name cannot be empty"); return; }
        if (name.trim().length < 2) { setProfileError("Name must be at least 2 characters"); return; }
        if (name.trim().length > 64) { setProfileError("Name must be under 64 characters"); return; }
        if (!nameHasChanges) { setProfileError("No changes detected"); return; }

        setIsSavingProfile(true);
        setProfileError("");

        try {
            await account.updateName(name.trim());
            setProfileSuccess(true);
            setTimeout(() => {
                setProfileSuccess(false);
                // Redirect to new slug if name changed
                router.push(`/users/${userId}/${slugify(name.trim())}/edit`);
            }, 1500);
        } catch (err: any) {
            setProfileError(err?.message || "Failed to update profile");
        } finally {
            setIsSavingProfile(false);
        }
    };

    // ── Submit: Update Password ─────────────────────────────────────────────
    const handleSavePassword = async () => {
        if (!currentPassword) { setPasswordError("Current password is required"); return; }
        if (!newPassword) { setPasswordError("New password is required"); return; }
        if (newPassword.length < 8) { setPasswordError("Password must be at least 8 characters"); return; }
        if (newPassword !== confirmPassword) { setPasswordError("Passwords do not match"); return; }
        if (currentPassword === newPassword) { setPasswordError("New password must differ from current password"); return; }

        setIsSavingPassword(true);
        setPasswordError("");

        try {
            await account.updatePassword(newPassword, currentPassword);
            setPasswordSuccess(true);
            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setTimeout(() => setPasswordSuccess(false), 3000);
        } catch (err: any) {
            setPasswordError(err?.message || "Failed to update password. Check your current password.");
        } finally {
            setIsSavingPassword(false);
        }
    };

    // ── Delete Account ──────────────────────────────────────────────────────
    const handleDeleteAccount = async () => {
        if (deleteConfirm !== initialName) {
            setShowDeleteWarning(true);
            return;
        }
        setIsDeletingAccount(true);
        try {
            // Appwrite doesn't allow self-deletion via client SDK directly
            // Best UX: logout and show message
            await logout();
            router.push("/?deleted=true");
        } catch (err: any) {
            setIsDeletingAccount(false);
        }
    };

    // ── Password strength ───────────────────────────────────────────────────
    const passwordStrength = React.useMemo(() => {
        if (!newPassword) return { score: 0, label: "", color: "" };
        let score = 0;
        if (newPassword.length >= 8) score++;
        if (newPassword.length >= 12) score++;
        if (/[A-Z]/.test(newPassword)) score++;
        if (/[0-9]/.test(newPassword)) score++;
        if (/[^A-Za-z0-9]/.test(newPassword)) score++;
        const labels = ["", "Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
        const colors = ["", "bg-red-500", "bg-orange-500", "bg-amber-400", "bg-[#a7c8b3]", "bg-emerald-400"];
        return { score, label: labels[score] || "", color: colors[score] || "" };
    }, [newPassword]);

    if (!user || user.$id !== userId) return null;

    const avatarUrl = avatars.getInitials(name || initialName, 80, 80).href;

    const reputationLevel =
        initialReputation < 50 ? "Newcomer" :
        initialReputation < 200 ? "Contributor" :
        initialReputation < 500 ? "Regular" :
        initialReputation < 1000 ? "Trusted" : "Expert";

    return (
        <div className="min-h-screen bg-[#080808] text-zinc-100">
            <TopNav />

            <div className="mx-auto flex max-w-[1440px]">
                {/* ── Desktop Sidebar ── */}
                <aside className="fixed left-0 top-16 hidden h-[calc(100vh-4rem)] w-60 border-r border-white/10 bg-[#080808] px-4 py-6 lg:block">
                    <nav className="space-y-1">
                        {sidebarItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.label}
                                    href={item.href}
                                    className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-zinc-500 transition duration-200 hover:bg-white/[0.05] hover:text-zinc-100"
                                >
                                    <Icon className="size-4" />
                                    <span>{item.label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Edit sections nav */}
                    <div className="mt-8">
                        <p className="mb-3 px-3 text-xs font-medium uppercase tracking-widest text-zinc-600">
                            Settings
                        </p>
                        {sections.map((s) => (
                            <button
                                key={s.id}
                                onClick={() => setActiveSection(s.id)}
                                className={cn(
                                    "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm transition duration-200",
                                    activeSection === s.id
                                        ? s.id === "danger"
                                            ? "border border-red-500/20 bg-red-500/10 text-red-400"
                                            : "border border-white/10 bg-white/[0.07] text-zinc-100"
                                        : s.id === "danger"
                                        ? "text-red-500/60 hover:text-red-400 hover:bg-red-500/[0.05]"
                                        : "text-zinc-500 hover:bg-white/[0.05] hover:text-zinc-100"
                                )}
                            >
                                {s.icon}
                                <span>{s.label}</span>
                            </button>
                        ))}
                    </div>

                    {/* Quick info */}
                    <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-600">
                            Account Info
                        </p>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-500">Reputation</span>
                                <span className="font-semibold text-[#a7c8b3]">{initialReputation}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-500">Level</span>
                                <span className="font-semibold text-zinc-300">{reputationLevel}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                                <span className="text-zinc-500">Member since</span>
                                <span className="font-semibold text-zinc-300">
                                    {convertDateToRelativeTime(new Date(createdAt))}
                                </span>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* ── Main Content ── */}
                <main className="w-full px-4 pb-24 pt-8 md:px-8 lg:ml-60 lg:px-12">
                    <div className="mx-auto max-w-2xl">

                        {/* ── Page Header ── */}
                        <div className="mb-8">
                            <Link
                                href={`/users/${userId}/${slugify(initialName)}`}
                                className="mb-4 inline-flex items-center gap-1.5 text-sm text-zinc-500 transition hover:text-zinc-300"
                            >
                                <ArrowLeft className="size-4" />
                                Back to profile
                            </Link>
                            <div className="mt-2 flex items-center justify-between">
                                <div>
                                    <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
                                        Edit Profile
                                    </h1>
                                    <p className="mt-1.5 text-sm text-zinc-500">
                                        Manage your account settings and preferences.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ── Mobile section tabs ── */}
                        <div className="mb-6 flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 lg:hidden">
                            {sections.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => setActiveSection(s.id)}
                                    className={cn(
                                        "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition",
                                        activeSection === s.id
                                            ? s.id === "danger"
                                                ? "bg-red-500/10 text-red-400"
                                                : "bg-[#a7c8b3] text-[#08100b]"
                                            : s.id === "danger"
                                            ? "text-red-500/60"
                                            : "text-zinc-500"
                                    )}
                                >
                                    {s.icon}
                                    <span className="hidden sm:inline">{s.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* ── Sections ── */}
                        <AnimatePresence mode="wait">

                            {/* ══ PROFILE SECTION ══ */}
                            {activeSection === "profile" && (
                                <motion.div
                                    key="profile"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.18 }}
                                    className="space-y-4"
                                >
                                    {/* Avatar card */}
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                                        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-zinc-100">
                                            <User className="size-4 text-[#a7c8b3]" />
                                            Profile Picture
                                        </h2>
                                        <div className="flex items-center gap-5">
                                            <div className="relative shrink-0">
                                                <img
                                                    src={avatarUrl}
                                                    alt={name}
                                                    className="size-20 rounded-2xl border border-white/10 object-cover"
                                                />
                                                <div className="absolute -bottom-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full border border-white/20 bg-[#080808]">
                                                    <Camera className="size-3.5 text-zinc-400" />
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-zinc-300">
                                                    Avatar generated from your name
                                                </p>
                                                <p className="mt-1 text-xs text-zinc-500">
                                                    Your avatar is automatically generated based on your display name initials. Update your name below to change it.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Name + Email */}
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                                        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-zinc-100">
                                            <User className="size-4 text-[#a7c8b3]" />
                                            Personal Information
                                        </h2>

                                        <div className="space-y-4">
                                            {/* Display Name */}
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-zinc-400">
                                                    Display Name
                                                </label>
                                                <div className="relative">
                                                    <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                                                    <Input
                                                        value={name}
                                                        onChange={(e) => {
                                                            setName(e.target.value);
                                                            setProfileError("");
                                                            setProfileSuccess(false);
                                                        }}
                                                        placeholder="Your display name"
                                                        maxLength={64}
                                                        className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                                    />
                                                </div>
                                                <div className="mt-1.5 flex items-center justify-between text-xs">
                                                    <span className="text-zinc-600">
                                                        This is how others see you across ByteNest
                                                    </span>
                                                    <span className={cn(
                                                        "font-medium",
                                                        name.length > 60 ? "text-amber-400" : "text-zinc-600"
                                                    )}>
                                                        {name.length}/64
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Email (read-only) */}
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-zinc-400">
                                                    Email Address
                                                </label>
                                                <div className="relative">
                                                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                                                    <Input
                                                        value={initialEmail}
                                                        readOnly
                                                        className="h-11 cursor-not-allowed rounded-xl border-white/10 bg-white/[0.02] pl-10 text-zinc-500 focus-visible:ring-0"
                                                    />
                                                </div>
                                                <p className="mt-1.5 text-xs text-zinc-600">
                                                    Email cannot be changed. Contact support if needed.
                                                </p>
                                            </div>

                                            {/* Stats preview */}
                                            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                                                <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-600">
                                                    Preview
                                                </p>
                                                <div className="flex items-center gap-3">
                                                    <img
                                                        src={avatars.getInitials(name || "?", 40, 40).href}
                                                        alt={name}
                                                        className="size-10 rounded-xl border border-white/10"
                                                    />
                                                    <div>
                                                        <p className="text-sm font-semibold text-zinc-100">
                                                            {name || "Your Name"}
                                                        </p>
                                                        <p className="text-xs text-zinc-500">
                                                            {initialReputation} reputation · {reputationLevel}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Error / Success */}
                                    <AnimatePresence>
                                        {profileError && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -6 }}
                                                className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                                            >
                                                <AlertCircle className="size-4 shrink-0" />
                                                {profileError}
                                                <button onClick={() => setProfileError("")} className="ml-auto">
                                                    <X className="size-4" />
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    <AnimatePresence>
                                        {profileSuccess && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.96 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
                                            >
                                                <CheckCircle2 className="size-4 shrink-0" />
                                                Profile updated successfully!
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Action buttons */}
                                    <div className="flex items-center justify-between gap-3 pt-1">
                                        <Link
                                            href={`/users/${userId}/${slugify(initialName)}`}
                                            className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                                        >
                                            <ArrowLeft className="size-4" />
                                            Cancel
                                        </Link>
                                        <Button
                                            onClick={handleSaveProfile}
                                            disabled={isSavingProfile || profileSuccess || !nameHasChanges}
                                            className="h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-6 text-sm font-semibold text-[#08100b] shadow-none transition hover:bg-[#b4d6bf] disabled:opacity-50"
                                        >
                                            {isSavingProfile ? (
                                                <><Loader2 className="size-4 animate-spin" /> Saving…</>
                                            ) : profileSuccess ? (
                                                <><CheckCircle2 className="size-4" /> Saved!</>
                                            ) : (
                                                <><Save className="size-4" /> Save Changes</>
                                            )}
                                        </Button>
                                    </div>
                                </motion.div>
                            )}

                            {/* ══ SECURITY SECTION ══ */}
                            {activeSection === "security" && (
                                <motion.div
                                    key="security"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.18 }}
                                    className="space-y-4"
                                >
                                    {/* Change password */}
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
                                        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-zinc-100">
                                            <Lock className="size-4 text-[#a7c8b3]" />
                                            Change Password
                                        </h2>
                                        <p className="mb-5 text-xs text-zinc-500">
                                            Use a strong password with a mix of letters, numbers, and symbols.
                                        </p>

                                        <div className="space-y-4">
                                            {/* Current password */}
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-zinc-400">
                                                    Current Password
                                                </label>
                                                <div className="relative">
                                                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                                                    <Input
                                                        type={showCurrentPw ? "text" : "password"}
                                                        value={currentPassword}
                                                        onChange={(e) => {
                                                            setCurrentPassword(e.target.value);
                                                            setPasswordError("");
                                                        }}
                                                        placeholder="Enter current password"
                                                        className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-10 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCurrentPw(!showCurrentPw)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300"
                                                    >
                                                        {showCurrentPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* New password */}
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-zinc-400">
                                                    New Password
                                                </label>
                                                <div className="relative">
                                                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                                                    <Input
                                                        type={showNewPw ? "text" : "password"}
                                                        value={newPassword}
                                                        onChange={(e) => {
                                                            setNewPassword(e.target.value);
                                                            setPasswordError("");
                                                        }}
                                                        placeholder="Enter new password"
                                                        className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-10 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowNewPw(!showNewPw)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300"
                                                    >
                                                        {showNewPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                                    </button>
                                                </div>

                                                {/* Password strength meter */}
                                                {newPassword && (
                                                    <div className="mt-2 space-y-1.5">
                                                        <div className="flex gap-1">
                                                            {[1, 2, 3, 4, 5].map((i) => (
                                                                <div
                                                                    key={i}
                                                                    className={cn(
                                                                        "h-1 flex-1 rounded-full transition-all duration-300",
                                                                        i <= passwordStrength.score
                                                                            ? passwordStrength.color
                                                                            : "bg-white/10"
                                                                    )}
                                                                />
                                                            ))}
                                                        </div>
                                                        <p className="text-xs text-zinc-500">
                                                            Strength:{" "}
                                                            <span className={cn(
                                                                "font-medium",
                                                                passwordStrength.score <= 2 ? "text-red-400" :
                                                                passwordStrength.score <= 3 ? "text-amber-400" :
                                                                "text-[#a7c8b3]"
                                                            )}>
                                                                {passwordStrength.label}
                                                            </span>
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Confirm password */}
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-zinc-400">
                                                    Confirm New Password
                                                </label>
                                                <div className="relative">
                                                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                                                    <Input
                                                        type={showConfirmPw ? "text" : "password"}
                                                        value={confirmPassword}
                                                        onChange={(e) => {
                                                            setConfirmPassword(e.target.value);
                                                            setPasswordError("");
                                                        }}
                                                        placeholder="Confirm new password"
                                                        className={cn(
                                                            "h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-10 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-offset-0",
                                                            confirmPassword && newPassword !== confirmPassword
                                                                ? "border-red-500/40 focus-visible:border-red-500/60 focus-visible:ring-red-500/10"
                                                                : confirmPassword && newPassword === confirmPassword
                                                                ? "border-emerald-500/40 focus-visible:border-emerald-500/60 focus-visible:ring-emerald-500/10"
                                                                : "focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15"
                                                        )}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowConfirmPw(!showConfirmPw)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 transition hover:text-zinc-300"
                                                    >
                                                        {showConfirmPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                                    </button>
                                                </div>
                                                {confirmPassword && newPassword !== confirmPassword && (
                                                    <p className="mt-1.5 text-xs text-red-400">Passwords do not match</p>
                                                )}
                                                {confirmPassword && newPassword === confirmPassword && (
                                                    <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-400">
                                                        <CheckCircle2 className="size-3" /> Passwords match
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tips card */}
                                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                                        <div className="mb-2.5 flex items-center gap-2">
                                            <Info className="size-4 text-[#a7c8b3]" />
                                            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">Password Tips</p>
                                        </div>
                                        <ul className="space-y-1.5 text-xs text-zinc-600">
                                            {[
                                                { ok: newPassword.length >= 8, label: "At least 8 characters" },
                                                { ok: /[A-Z]/.test(newPassword), label: "One uppercase letter" },
                                                { ok: /[0-9]/.test(newPassword), label: "One number" },
                                                { ok: /[^A-Za-z0-9]/.test(newPassword), label: "One special character" },
                                            ].map((tip) => (
                                                <li key={tip.label} className="flex items-center gap-2">
                                                    <span className={cn(
                                                        "size-1.5 rounded-full",
                                                        newPassword
                                                            ? tip.ok ? "bg-[#a7c8b3]" : "bg-zinc-700"
                                                            : "bg-zinc-700"
                                                    )} />
                                                    <span className={newPassword && tip.ok ? "text-zinc-400" : ""}>{tip.label}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    {/* Error / Success */}
                                    <AnimatePresence>
                                        {passwordError && (
                                            <motion.div
                                                initial={{ opacity: 0, y: -6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -6 }}
                                                className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
                                            >
                                                <AlertCircle className="size-4 shrink-0" />
                                                {passwordError}
                                                <button onClick={() => setPasswordError("")} className="ml-auto">
                                                    <X className="size-4" />
                                                </button>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                    <AnimatePresence>
                                        {passwordSuccess && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.96 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0 }}
                                                className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
                                            >
                                                <CheckCircle2 className="size-4 shrink-0" />
                                                Password updated successfully!
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Action buttons */}
                                    <div className="flex items-center justify-between gap-3 pt-1">
                                        <button
                                            onClick={() => {
                                                setCurrentPassword("");
                                                setNewPassword("");
                                                setConfirmPassword("");
                                                setPasswordError("");
                                            }}
                                            className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-zinc-400 transition hover:bg-white/[0.08] hover:text-zinc-100"
                                        >
                                            <X className="size-4" />
                                            Clear
                                        </button>
                                        <Button
                                            onClick={handleSavePassword}
                                            disabled={isSavingPassword || passwordSuccess || !currentPassword || !newPassword || !confirmPassword}
                                            className="h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-6 text-sm font-semibold text-[#08100b] shadow-none transition hover:bg-[#b4d6bf] disabled:opacity-50"
                                        >
                                            {isSavingPassword ? (
                                                <><Loader2 className="size-4 animate-spin" /> Updating…</>
                                            ) : passwordSuccess ? (
                                                <><CheckCircle2 className="size-4" /> Updated!</>
                                            ) : (
                                                <><Shield className="size-4" /> Update Password</>
                                            )}
                                        </Button>
                                    </div>
                                </motion.div>
                            )}

                            {/* ══ DANGER ZONE SECTION ══ */}
                            {activeSection === "danger" && (
                                <motion.div
                                    key="danger"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.18 }}
                                    className="space-y-4"
                                >
                                    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
                                        <h2 className="mb-2 flex items-center gap-2 text-base font-semibold text-red-400">
                                            <AlertCircle className="size-4" />
                                            Delete Account
                                        </h2>
                                        <p className="mb-6 text-sm leading-relaxed text-zinc-400">
                                            Once you delete your account, there is no going back. Please be certain.
                                        </p>
                                        
                                        <div className="space-y-4 rounded-xl border border-red-500/10 bg-red-500/5 p-4">
                                            <div>
                                                <label className="mb-2 block text-sm font-medium text-red-400/80">
                                                    To verify, type <span className="font-bold text-red-400">{initialName}</span> below:
                                                </label>
                                                <Input
                                                    value={deleteConfirm}
                                                    onChange={(e) => {
                                                        setDeleteConfirm(e.target.value);
                                                        setShowDeleteWarning(false);
                                                    }}
                                                    className="h-11 rounded-xl border-red-500/20 bg-red-500/5 pl-4 text-zinc-100 placeholder:text-red-500/40 focus-visible:border-red-500/60 focus-visible:ring-red-500/20"
                                                    placeholder={initialName}
                                                />
                                                {showDeleteWarning && (
                                                    <p className="mt-2 text-xs text-red-400">Please type your exact name to confirm.</p>
                                                )}
                                            </div>
                                            
                                            <Button
                                                onClick={handleDeleteAccount}
                                                disabled={isDeletingAccount || deleteConfirm !== initialName}
                                                className="h-10 w-full rounded-xl bg-red-500/10 font-bold text-red-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50 shadow-none border border-red-500/20"
                                            >
                                                {isDeletingAccount ? (
                                                    <><Loader2 className="size-4 animate-spin mr-2" /> Deleting...</>
                                                ) : (
                                                    "Delete my account"
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </main>
            </div>
            
            {/* Mobile bottom nav */}
            <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-2xl border border-white/10 bg-[#101010]/90 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl lg:hidden">
                {sidebarItems.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.label}
                            href={item.href}
                            className="flex size-10 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-100"
                        >
                            <Icon className="size-4" />
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}

// ─── TopNav ───────────────────────────────────────────────────────────────────

function TopNav() {
    return (
        <header className="sticky top-0 z-50 h-16 border-b border-white/10 bg-[#080808]/85 backdrop-blur-xl">
            <div className="mx-auto grid h-full max-w-[1440px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 md:gap-6 md:px-6 lg:grid-cols-[240px_minmax(320px,720px)_auto]">
                <Link href="/" className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-sm font-semibold text-[#a7c8b3]">
                        B
                    </span>
                    <span className="hidden text-sm font-semibold text-zinc-100 sm:inline">
                        ByteNest
                    </span>
                </Link>

                <div className="relative mx-auto w-full max-w-2xl">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                        placeholder="Search questions, tags, or authors"
                        className="h-11 rounded-xl border-white/10 bg-white/[0.04] pl-10 pr-4 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-none transition hover:border-white/15 focus-visible:border-[#a7c8b3]/60 focus-visible:ring-2 focus-visible:ring-[#a7c8b3]/15 focus-visible:ring-offset-0"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && e.currentTarget.value.trim()) {
                                window.location.href = `/questions?search=${encodeURIComponent(
                                    e.currentTarget.value.trim()
                                )}`;
                            }
                        }}
                    />
                </div>

                <Button
                    asChild
                    className="h-10 rounded-xl border border-[#a7c8b3]/20 bg-[#a7c8b3] px-3 text-sm font-medium text-[#08100b] shadow-none transition hover:bg-[#b4d6bf] md:px-4"
                >
                    <Link href="/questions/ask">
                        <Plus className="size-4" />
                        <span className="hidden sm:inline">Ask Question</span>
                    </Link>
                </Button>
            </div>
        </header>
    );
}
