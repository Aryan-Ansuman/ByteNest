// src/app/api/skills/health/route.ts
// Phase 8 — Step 8.4

import { db, skillCalcEventsCollection, tagExpertRegistryCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { NextResponse } from "next/server";
import { Query } from "node-appwrite";

export const dynamic = "force-dynamic";

const EVENTS_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours
const REGISTRY_STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export async function GET() {
    try {
        const [latestEventPage, latestRegistryPage] = await Promise.all([
            // $createdAt is a built-in attribute — safe to order on without
            // a custom index, unlike custom fields like scheduledAt.
            databases.listDocuments(db, skillCalcEventsCollection, [
                Query.orderDesc("$createdAt"),
                Query.limit(1),
            ]),
            // tag_expert_registry has no index on builtAt alone, so order by
            // the built-in $updatedAt (always indexed) and fall back to it
            // if builtAt is missing on the doc.
            databases.listDocuments(db, tagExpertRegistryCollection, [
                Query.orderDesc("$updatedAt"),
                Query.limit(1),
            ]),
        ]);

        const now = Date.now();

        // ── Calculation events check ──────────────────────────────────────
        const latestEventDoc = latestEventPage.documents[0] ?? null;
        const latestEventTimestamp =
            (latestEventDoc?.completedAt as string) ||
            (latestEventDoc?.scheduledAt as string) ||
            latestEventDoc?.$createdAt ||
            null;
        const latestEventAt = latestEventTimestamp ? new Date(latestEventTimestamp).getTime() : null;
        const eventsAgeMs = latestEventAt !== null ? now - latestEventAt : null;
        // `null` means "no events recorded yet" — reported as unknown, not a
        // failure, since a freshly launched platform has nothing to recalc yet.
        const eventsHealthy = latestEventAt === null ? null : eventsAgeMs! <= EVENTS_STALE_THRESHOLD_MS;

        // ── Tag expert registry check ─────────────────────────────────────
        const latestRegistryDoc = latestRegistryPage.documents[0] ?? null;
        const latestRegistryTimestamp =
            (latestRegistryDoc?.builtAt as string) || latestRegistryDoc?.$updatedAt || null;
        const latestRegistryAt = latestRegistryTimestamp
            ? new Date(latestRegistryTimestamp).getTime()
            : null;
        const registryAgeMs = latestRegistryAt !== null ? now - latestRegistryAt : null;
        const registryHealthy =
            latestRegistryAt === null ? null : registryAgeMs! <= REGISTRY_STALE_THRESHOLD_MS;

        // ── Overall status ────────────────────────────────────────────────
        const anyUnhealthy = eventsHealthy === false || registryHealthy === false;
        const status = anyUnhealthy ? "unhealthy" : "ok";

        const payload = {
            status,
            checkedAt: new Date(now).toISOString(),
            checks: {
                calculationEvents: {
                    healthy: eventsHealthy,
                    lastEventAt: latestEventAt ? new Date(latestEventAt).toISOString() : null,
                    ageMinutes: eventsAgeMs !== null ? Math.round(eventsAgeMs / 60_000) : null,
                    thresholdMinutes: EVENTS_STALE_THRESHOLD_MS / 60_000,
                    lastEventStatus: (latestEventDoc?.status as string) ?? null,
                    lastEventTriggerType: (latestEventDoc?.triggerType as string) ?? null,
                },
                tagExpertRegistry: {
                    healthy: registryHealthy,
                    lastBuiltAt: latestRegistryAt ? new Date(latestRegistryAt).toISOString() : null,
                    ageMinutes: registryAgeMs !== null ? Math.round(registryAgeMs / 60_000) : null,
                    thresholdMinutes: REGISTRY_STALE_THRESHOLD_MS / 60_000,
                },
            },
        };

        return NextResponse.json(payload, {
            status: anyUnhealthy ? 503 : 200,
            headers: { "Cache-Control": "no-store" },
        });
    } catch (error: any) {
        return NextResponse.json(
            { status: "error", error: error?.message || "Health check failed" },
            { status: 500, headers: { "Cache-Control": "no-store" } }
        );
    }
}
