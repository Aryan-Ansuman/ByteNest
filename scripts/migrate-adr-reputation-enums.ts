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
        console.log("✅ eventType enum updated — includes adr_score_submitted, adr_consensus_reached.");
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
        console.log("✅ sourceType enum updated — includes adr_submission.");
    } catch (e: any) {
        console.error("❌ Failed to update sourceType enum:", e?.message || e);
    }
}

main();
