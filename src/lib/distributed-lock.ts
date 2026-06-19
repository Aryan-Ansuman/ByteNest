import { createHash, randomUUID } from "crypto";
import { db, rateLimitCollection } from "@/models/name";
import { databases } from "@/models/server/config";

const DEFAULT_LEASE_MS = 10_000;
const DEFAULT_WAIT_MS = 3_000;
const RETRY_DELAY_MS = 50;

export async function withDistributedLock<T>(
    key: string,
    task: () => Promise<T>,
    options: { leaseMs?: number; waitMs?: number } = {}
): Promise<T> {
    const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
    const documentId = lockDocumentId(key);
    const token = randomUUID();
    const deadline = Date.now() + waitMs;

    for (;;) {
        const now = Date.now();
        try {
            await databases.createDocument(db, rateLimitCollection, documentId, {
                key: `lock:${key}`,
                bucket: token,
                createdAt: now,
                expiresAt: now + leaseMs,
            });
            break;
        } catch (error: any) {
            if (error?.code !== 409) throw error;

            const existing = await databases
                .getDocument(db, rateLimitCollection, documentId)
                .catch(() => null);

            if (existing && Number(existing.expiresAt ?? 0) <= now) {
                await databases
                    .deleteDocument(db, rateLimitCollection, documentId)
                    .catch(() => undefined);
                continue;
            }

            if (now >= deadline) {
                const error = new Error(
                    "This action is already being processed. Please try again."
                ) as Error & { status?: number };
                error.status = 409;
                throw error;
            }
            await sleep(RETRY_DELAY_MS);
        }
    }

    try {
        return await task();
    } finally {
        const lock = await databases
            .getDocument(db, rateLimitCollection, documentId)
            .catch(() => null);
        if (lock?.bucket === token) {
            await databases
                .deleteDocument(db, rateLimitCollection, documentId)
                .catch(() => undefined);
        }
    }
}

function lockDocumentId(key: string) {
    return createHash("sha256").update(`lock:${key}`).digest("hex").slice(0, 32);
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
