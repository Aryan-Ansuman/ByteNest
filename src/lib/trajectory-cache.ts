import { createHash } from "crypto";
import { databases } from "@/models/server/config";
import { db, rateLimitCollection } from "@/models/name";
import type { TrajectoryResult } from "./trajectory-engine";

export const TRAJECTORY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_KEY_PREFIX = "traj-cache:";

export interface TrajectoryCachePayload {
    data: TrajectoryResult & { currentReputation: number };
    cachedAt: number;
}

function cacheDocId(userId: string): string {
    return createHash("sha256")
        .update(`${CACHE_KEY_PREFIX}${userId}`)
        .digest("hex")
        .slice(0, 32);
}

export async function readTrajectoryCache(userId: string): Promise<
    { hit: true; payload: TrajectoryCachePayload } | { hit: false; payload: null }
> {
    const docId = cacheDocId(userId);

    let doc: any;
    try {
        doc = await databases.getDocument(db, rateLimitCollection, docId);
    } catch {
        return { hit: false, payload: null };
    }

    const now = Date.now();
    const expiresAt = Number(doc.expiresAt ?? 0);

    if (expiresAt <= now) {
        databases.deleteDocument(db, rateLimitCollection, docId).catch(() => undefined);
        return { hit: false, payload: null };
    }

    // Trajectory response is around 700 chars, so it might be split into up to 4 chunks
    let valueJson = "";
    for (let i = 1; i <= 4; i++) {
        const valueDocId = docId.slice(0, 30) + `v${i}`;
        try {
            const valueDoc = await databases.getDocument(db, rateLimitCollection, valueDocId);
            valueJson += (valueDoc.key ?? "") + (valueDoc.bucket ?? "");
        } catch {
            break; // No more chunks
        }
    }

    if (!valueJson) {
        return { hit: false, payload: null };
    }

    let payload: TrajectoryCachePayload;
    try {
        payload = JSON.parse(valueJson);
    } catch {
        return { hit: false, payload: null };
    }

    return { hit: true, payload };
}

export async function writeTrajectoryCache(
    userId: string,
    payload: Omit<TrajectoryCachePayload, "cachedAt">
): Promise<void> {
    const docId = cacheDocId(userId);
    const now = Date.now();
    const expiresAt = now + TRAJECTORY_CACHE_TTL_MS;

    const fullPayload: TrajectoryCachePayload = { ...payload, cachedAt: now };
    const valueJson = JSON.stringify(fullPayload);

    // Upsert anchor document
    await databases.deleteDocument(db, rateLimitCollection, docId).catch(() => undefined);
    await databases.createDocument(db, rateLimitCollection, docId, {
        key: `${CACHE_KEY_PREFIX}${userId}`,
        bucket: String(expiresAt),
        createdAt: now,
        expiresAt,
    });

    const MAX_CHUNK = 317; // 254 for key + 63 for bucket
    for (let i = 0; i < 4; i++) {
        const valueDocId = docId.slice(0, 30) + `v${i + 1}`;
        const chunk = valueJson.slice(i * MAX_CHUNK, (i + 1) * MAX_CHUNK);

        await databases.deleteDocument(db, rateLimitCollection, valueDocId).catch(() => undefined);
        
        if (!chunk) continue;

        const keyChunk = chunk.slice(0, 254);
        const bucketChunk = chunk.slice(254, 317);

        await databases.createDocument(db, rateLimitCollection, valueDocId, {
            key: keyChunk,
            bucket: bucketChunk,
            createdAt: now,
            expiresAt,
        });
    }
}

export async function invalidateTrajectoryCache(userId: string): Promise<void> {
    const docId = cacheDocId(userId);
    
    const deletes = [databases.deleteDocument(db, rateLimitCollection, docId)];
    for (let i = 1; i <= 4; i++) {
        deletes.push(databases.deleteDocument(db, rateLimitCollection, docId.slice(0, 30) + `v${i}`));
    }

    await Promise.allSettled(deletes);
}
