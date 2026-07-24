/**
 * Socratic Debugging Mode — interrogative detection utility.
 *
 * Pure functions with zero side-effects. Imported by both:
 *  - The Next.js API route (server-side enforcement)
 *  - MessageInput.tsx (client-side real-time feedback)
 */

// ─── Interrogative starters ──────────────────────────────────────────────────
// Short words (is, do, are…) require a trailing space to avoid false-positives
// on words like "island", "don't", "area", etc.
export const INTERROGATIVE_STARTERS: string[] = [
    "what",
    "why",
    "how",
    "when",
    "where",
    "who",
    "which",
    "could",
    "would",
    "can ",
    "do ",
    "does",
    "did",
    "is ",
    "are",
    "was",
    "were",
    "have",
    "has",
    "had",
    "should",
    "will",
    "might",
    "may",
    "wouldn't",
    "couldn't",
    "shouldn't",
    "haven't",
    "hasn't",
    "isn't",
    "aren't",
    "doesn't",
    "didn't",
    "won't",
];

// ─── "I found it" trigger phrases ────────────────────────────────────────────
const FOUND_IT_TRIGGERS: string[] = [
    "i found it",
    "i found the issue",
    "i found the bug",
    "i found the problem",
    "i figured it out",
    "i got it",
    "found it",
    "eureka",
    "i understand now",
    "i see the problem",
    "i know what's wrong",
    "i know what is wrong",
    "i see what's wrong",
    "i see what is wrong",
    "i found the root cause",
    "i understand the issue",
];

/**
 * Returns true when a message qualifies as interrogative.
 *
 * Rules (any one is sufficient):
 *  1. `messageType` is "code" or "system"  → always allowed
 *  2. Message ends with "?"
 *  3. Message starts (case-insensitive) with a canonical interrogative starter
 */
export function isInterrogative(message: string, messageType: string): boolean {
    // Code/system messages are always allowed
    if (messageType === "code" || messageType === "system") return true;

    const trimmed = message.trim();
    if (!trimmed) return true; // Empty — don't block

    // Rule 2: ends with "?"
    if (trimmed.endsWith("?")) return true;

    // Rule 3: starts with an interrogative starter (case-insensitive)
    const lower = trimmed.toLowerCase();
    for (const starter of INTERROGATIVE_STARTERS) {
        if (lower.startsWith(starter)) return true;
    }

    return false;
}

/**
 * Returns a hint string to display when `isInterrogative` returns false.
 * Guides the helper toward rephrasing as a question.
 */
export function getSocraticHint(message: string): string {
    const trimmed = message.trim();

    // If it looks like it almost has a question mark
    if (trimmed.length > 3 && !trimmed.endsWith("?")) {
        return "Try ending your message with '?' to turn it into a question.";
    }

    return "Helpers must ask questions. Try starting with 'What', 'Why', 'How', 'Could', or 'Have you…?'";
}

/**
 * Returns true when the message matches a "I found it" trigger phrase.
 * Only applied to the seeker's messages on the client side.
 */
export function isFoundItTrigger(message: string): boolean {
    const lower = message.trim().toLowerCase();
    if (!lower) return false;
    return FOUND_IT_TRIGGERS.some((trigger) => lower.includes(trigger));
}
