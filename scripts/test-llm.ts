import { processLlmSmellValidation } from "../src/lib/events/processors/LlmSmellValidationProcessor";

async function main() {
    console.log("Running LLM validation...");
    try {
        await processLlmSmellValidation({
            eventType: "LlmSmellValidation",
            questionId: "6a48e99b002422b63a86",
            contentHash: "dummy-hash",
            pendingSmells: [], // Should fallback to SMELL_CATALOG
            titleContext: "Why is my script so slow? Performance issue taking forever",
        });
        console.log("Done.");
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
