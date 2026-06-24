// Six brand-consistent colors. Order matters — index 0 is the primary accent.
const PALETTE = [
    "indigo",
    "violet",
    "emerald",
    "amber",
    "rose",
    "cyan",
] as const;

/**
 * Maps any userId string to one of the six brand palette colors.
 * Deterministic: the same userId always produces the same color across
 * all rooms, sessions, and server restarts.
 *
 * Call this in every route that creates a room_members or room_messages
 * document — never let the client choose the color.
 */
export function getAvatarColor(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        // djb2-style: multiply-add hash, forced to 32-bit signed int
        hash = (Math.imul(hash, 31) + userId.charCodeAt(i)) | 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
}
