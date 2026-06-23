import { eventQueueCollection } from "@/models/name";

/**
 * Required Appwrite indexes — create in console or migration:
 *
 * event_queue:
 *   - status     (key)           ← poller filters by "pending"
 *   - dedupKey   (key)           ← idempotency check
 *   - createdAt  (key)           ← TTL sweep of old complete/failed events
 *   - eventType  (key)           ← per-type poller functions
 */
export const EVENT_COLLECTIONS = {
  QUEUE: eventQueueCollection,
} as const;
