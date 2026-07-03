// scripts/migrate-tva-reputation-enums.ts
// Run once with `npx tsx scripts/migrate-tva-reputation-enums.ts`
//
// TVA — Phase 7. reputation_events.eventType and .sourceType are Appwrite
// enum attributes, fixed at collection-creation time. Adding "answer_verified"
// / "test_run" to the TypeScript source in models/name.ts does NOT change
// what Appwrite will accept — the enum itself has to be updated in place,
// or every answer_verified write will throw "invalid enum value" (which
// adjustRep/writeReputationEvent log and swallow, so the failure is silent
// unless this migration runs first).
import { databases } from "@/models/server/config";
import {
    db,
    reputationEventsCollection,
    REPUTATION_EVENT_TYPES,
    REPUTATION_SOURCE_TYPES,
} from "@/models/name";

async function waitForAttribute(key: string, attemptLimit = 60) {
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
        const current: any = await databases.getAttribute(db, reputationEventsCollection, key);
        if (current.status === "available") return;
        if (current.status === "failed") {
            throw new Error(`Attribute ${key} failed to update`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for attribute ${key} to become available again`);
}

async function main() {
    console.log("Updating reputation_events.eventType enum...");
    try {
        await databases.updateEnumAttribute(
            db,
            reputationEventsCollection,
            "eventType",
            [...REPUTATION_EVENT_TYPES],
            true, // required — matches the original attribute definition
            null as any // Appwrite SDK bug workaround
        );
        await waitForAttribute("eventType");
        console.log("✅ eventType enum updated — includes answer_verified.");
    } catch (e: any) {
        console.error("❌ Failed to update eventType enum:", e?.message || e);
        return; // don't attempt sourceType if this failed — surface the error clearly
    }

    console.log("Updating reputation_events.sourceType enum...");
    try {
        await databases.updateEnumAttribute(
            db,
            reputationEventsCollection,
            "sourceType",
            [...REPUTATION_SOURCE_TYPES],
            false, // optional — matches the original attribute definition
            null as any // Appwrite SDK bug workaround
        );
        await waitForAttribute("sourceType");
        console.log("✅ sourceType enum updated — includes test_run.");
    } catch (e: any) {
        console.error("❌ Failed to update sourceType enum:", e?.message || e);
    }
}

main();
