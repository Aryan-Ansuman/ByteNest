export function getUserInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";

    return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

const AVATAR_STYLES = [
    "border-emerald-300/20 bg-emerald-300/15 text-emerald-200",
    "border-sky-300/20 bg-sky-300/15 text-sky-200",
    "border-violet-300/20 bg-violet-300/15 text-violet-200",
    "border-amber-300/20 bg-amber-300/15 text-amber-200",
    "border-rose-300/20 bg-rose-300/15 text-rose-200",
] as const;

export function getUserAvatarStyle(seed: string): string {
    let hash = 0;
    for (let index = 0; index < seed.length; index++) {
        hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    }

    return AVATAR_STYLES[Math.abs(hash) % AVATAR_STYLES.length];
}
