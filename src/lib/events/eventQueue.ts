import { databases } from "@/models/server/config";
import { db as DB } from "@/models/name";
import { ID, Query } from "node-appwrite";
import { EVENT_COLLECTIONS } from "./collections";
import { buildDedupKey } from "./dedupKey";
import type {
  EventType,
  EventPayloadMap,
  QueuedEvent,
  EventStatus,
} from "./types";

const COL = EVENT_COLLECTIONS.QUEUE;

// ─── Dedup window: skip if same dedupKey processed within this many ms ────────
const DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// ─── Publish ──────────────────────────────────────────────────────────────────

/**
 * Publishes an event to the queue.
 * Checks dedup window before writing — silently skips if already processed.
 * Returns the queued document, or null if deduped.
 */
export async function publishEvent<T extends EventType>(
  eventType: T,
  payload: EventPayloadMap[T]
): Promise<QueuedEvent | null> {
  const dedupKey = await buildDedupKey(eventType, payload);

  const isDuplicate = await checkDedup(dedupKey);
  if (isDuplicate) return null;

  const now = new Date().toISOString();
  const doc = await databases.createDocument(DB, COL, ID.unique(), {
    eventType,
    payload: JSON.stringify(payload),
    status: "pending" satisfies EventStatus,
    dedupKey,
    retryCount: 0,
    createdAt: now,
    processedAt: null,
  });

  return deserialize(doc);
}

// ─── Poll ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the next batch of pending events for a given type (or all types).
 * Called by Appwrite Function pollers on a schedule.
 */
export async function pollPendingEvents(
  eventType: EventType | null = null,
  limit = 20
): Promise<QueuedEvent[]> {
  const queries = [
    Query.equal("status", "pending"),
    Query.orderAsc("createdAt"),
    Query.limit(limit),
  ];

  if (eventType) {
    queries.push(Query.equal("eventType", eventType));
  }

  const res = await databases.listDocuments(DB, COL, queries);
  return res.documents.map(deserialize);
}

// ─── Status transitions ───────────────────────────────────────────────────────

export async function markProcessing(eventId: string): Promise<void> {
  await databases.updateDocument(DB, COL, eventId, {
    status: "processing" satisfies EventStatus,
  });
}

export async function markComplete(eventId: string): Promise<void> {
  await databases.updateDocument(DB, COL, eventId, {
    status: "complete" satisfies EventStatus,
    processedAt: new Date().toISOString(),
  });
}

export async function markFailed(
  eventId: string,
  retryCount: number
): Promise<void> {
  // Permanently failed after 5 attempts — stays failed, not retried
  const nextStatus: EventStatus = retryCount >= 5 ? "failed" : "pending";

  await databases.updateDocument(DB, COL, eventId, {
    status: nextStatus,
    retryCount,
    processedAt: retryCount >= 5 ? new Date().toISOString() : null,
  });
}

// ─── Dedup check ──────────────────────────────────────────────────────────────

async function checkDedup(dedupKey: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  const res = await databases.listDocuments(DB, COL, [
    Query.equal("dedupKey", dedupKey),
    Query.equal("status", ["complete", "processing"]),
    Query.greaterThan("createdAt", windowStart),
    Query.limit(1),
  ]);

  return res.documents.length > 0;
}

// ─── TTL sweep — call daily to keep collection small ─────────────────────────

/**
 * Deletes complete and permanently-failed events older than `olderThanDays`.
 * Run as a scheduled Appwrite Function once per day.
 */
export async function sweepOldEvents(olderThanDays = 7): Promise<number> {
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  ).toISOString();

  let cursor: string | undefined;
  let deleted = 0;

  do {
    const queries = [
      Query.equal("status", ["complete", "failed"]),
      Query.lessThan("createdAt", cutoff),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments(DB, COL, queries);
    if (res.documents.length === 0) break;

    await Promise.all(
      res.documents.map((doc) => databases.deleteDocument(DB, COL, doc.$id))
    );

    deleted += res.documents.length;
    cursor = res.documents[res.documents.length - 1].$id;
  } while (true);

  return deleted;
}

// ─── Serialization ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserialize(doc: any): QueuedEvent {
  return {
    $id: doc.$id,
    eventType: doc.eventType,
    payload: doc.payload,
    status: doc.status,
    dedupKey: doc.dedupKey,
    retryCount: doc.retryCount,
    createdAt: doc.createdAt,
    processedAt: doc.processedAt ?? null,
  };
}
