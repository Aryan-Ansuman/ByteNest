import type { SessionFile } from "@/types/rooms";

export const SESSION_LANGUAGES = [
    "javascript",
    "typescript",
    "python",
    "rust",
    "go",
    "html",
    "css",
] as const;

export type SessionLanguage = (typeof SESSION_LANGUAGES)[number];

const VALID_FILENAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function normalizeSessionLanguage(language: unknown): SessionLanguage {
    return SESSION_LANGUAGES.includes(language as SessionLanguage)
        ? (language as SessionLanguage)
        : "javascript";
}

export function validateSessionFilename(
    input: unknown,
    existingFiles: Pick<SessionFile, "name">[] = []
): { name: string; error: null } | { name: null; error: string } {
    if (typeof input !== "string") {
        return { name: null, error: "Filename is required" };
    }

    const name = input.trim();
    if (!name) {
        return { name: null, error: "Filename is required" };
    }

    if (
        name === "." ||
        name === ".." ||
        name.includes("..") ||
        name.includes("/") ||
        name.includes("\\")
    ) {
        return { name: null, error: "Filename cannot contain paths or traversal" };
    }

    if (!VALID_FILENAME_RE.test(name) || name.endsWith(".")) {
        return {
            name: null,
            error: "Use 1-80 letters, numbers, dots, dashes, or underscores",
        };
    }

    const normalized = name.toLowerCase();
    if (existingFiles.some((file) => file.name.toLowerCase() === normalized)) {
        return { name: null, error: "A file with that name already exists" };
    }

    return { name, error: null };
}
