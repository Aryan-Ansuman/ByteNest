import { ID, Query } from "node-appwrite";
import { db, eventQueueCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import type { CheckAdrConsensusPayload, QueuedEvent } from "@/lib/events/types";

// ─── Architecture Decision Record (ADR) Questions — Phase 8 ────────────────
// Enqueues a consensus check, called by POST /api/adr and PATCH /api/adr
// after every successful score submission/revision.
//
// Deliberately bypasses the generic publishEvent()/buildDedupKey() pair
// (src/lib/events/eventQueue.ts). That module's dedup window treats a
// *completed* event with a matching key as a duplicate for a full hour —
// correct for events like EmbeddingRequested where re-running against the
// same content really is redundant, but wrong here: once a consensus check
// has *finished*, a brand-new submission genuinely needs a fresh check to
// account for it, not a silent drop until the hour is up. Phase 8's actual
// requirement is narrower — "if a consensus check is already queued for
// this question, the new submission's event is dropped" — i.e. dedupe only
// against pending/processing, never against complete/failed. Hence the
// literal dedupKey format and the hand-rolled duplicate check below,
// instead of the SHA-256 field-hash approach every other event type uses.
const dedupKeyFor = (questionId: string) => `adr_consensus_${questionId}`;

export async function enqueueAdrConsensusCheck(questionId: string): Promise<QueuedEvent | null> {
    const dedupKey = dedupKeyFor(questionId);

    const existing = await databases.listDocuments(db, eventQueueCollection, [
        Query.equal("dedupKey", dedupKey),
        Query.equal("status", ["pending", "processing"]),
        Query.limit(1),
    ]);
    if (existing.total > 0) {
        // A check for this question is already queued or running — it will
        // read the current state of adr_score_submissions when it runs, so
        // this new submission's data is covered without a second event.
        return null;
    }

    const payload: CheckAdrConsensusPayload = { questionId };
    const now = new Date().toISOString();

    const doc = await databases.createDocument(db, eventQueueCollection, ID.unique(), {
        eventType: "CheckAdrConsensus",
        payload: JSON.stringify(payload),
        status: "pending",
        dedupKey,
        retryCount: 0,
        createdAt: now,
        processedAt: null,
    });

    const queuedEvent: QueuedEvent = {
        $id: doc.$id,
        eventType: "CheckAdrConsensus",
        payload: doc.payload,
        status: doc.status,
        dedupKey: doc.dedupKey,
        retryCount: doc.retryCount,
        createdAt: doc.createdAt,
        processedAt: doc.processedAt ?? null,
    };

    // Same local-dev auto-dispatch convenience as publishEvent() — lets the
    // check run immediately without needing a poller running locally.
    if (process.env.NODE_ENV === "development") {
        import("@/lib/events/dispatcher")
            .then(({ dispatchEvent }) => dispatchEvent(queuedEvent))
            .catch((err) => console.error("[enqueueAdrConsensusCheck] Local dispatch failed:", err));
    }

    return queuedEvent;
}
