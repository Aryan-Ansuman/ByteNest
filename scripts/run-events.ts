import { loadEnvConfig } from "@next/env";

// Load environment variables for standalone execution BEFORE importing app code
loadEnvConfig(process.cwd());

async function main() {
    const { pollPendingEvents, dispatchEvent } = await import("../src/lib/events");

    console.log("[run-events] Fetching pending events...");
    const events = await pollPendingEvents(undefined, 20);
    
    if (events.length === 0) {
        console.log("[run-events] No pending events found.");
        return;
    }

    console.log(`[run-events] Found ${events.length} pending events. Processing...`);
    
    const results = await Promise.allSettled(
        events.map((event) => dispatchEvent(event))
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    console.log(`[run-events] Processed ${events.length} events:`);
    console.log(`  ✅ Succeeded: ${succeeded}`);
    console.log(`  ❌ Failed: ${failed}`);

    if (failed > 0) {
        console.error("Some events failed:");
        results.forEach((r, i) => {
            if (r.status === "rejected") {
                console.error(`Event ${events[i].eventType}:`, r.reason);
            }
        });
    }
}

main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
