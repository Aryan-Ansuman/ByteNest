import { databases } from "../src/models/server/config";
import { db, processedWebhookEventsCollection } from "../src/models/name";
import createProcessedWebhookEventsCollection from "../src/models/server/processed-webhook-events.collection";

async function main() {
    try {
        await databases.getCollection(db, processedWebhookEventsCollection);
        console.log("Collection already exists");
    } catch (e) {
        console.log("Creating collection...");
        await createProcessedWebhookEventsCollection();
        console.log("Collection created successfully");
    }
}

main().catch(console.error);
