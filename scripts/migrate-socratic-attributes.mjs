import { Client, Databases } from "node-appwrite";

const db = "6a2bbffd00190eccf0b8";
const discussionRoomsCollection = "discussion_rooms";

async function run() {
    console.log("Migrating Socratic Mode attributes on discussion_rooms...");

    const client = new Client();
    client
        .setEndpoint("https://sgp.cloud.appwrite.io/v1")
        .setProject("6a2a94690035eff3c195")
        .setKey("standard_011fde8ca921a789e8bbe1042befcd0fa4e7bbfb38ca12276e107e62ed6bddc0a30e708fafecdd4799f91e9f682cdf28b89cb3c399bde2a434cfd900554fa68a069f20f22ca55d89b5c7bfc9700dfe8574e23e313d3e642c3a5d648b9039b165c7972152ea969aa07a61d0091423f0035587693e1fd3e43f3ec29a0bda88fcf9");

    const databases = new Databases(client);

    const attributes = [
        databases.createBooleanAttribute(db, discussionRoomsCollection, "socraticMode", false, false, false),
        databases.createStringAttribute(db, discussionRoomsCollection, "socraticSeekerId", 36, false),
        databases.createDatetimeAttribute(db, discussionRoomsCollection, "socraticStartedAt", false),
        databases.createStringAttribute(db, discussionRoomsCollection, "linkedQuestionId", 36, false),
        databases.createStringAttribute(db, discussionRoomsCollection, "linkedQuestionTitle", 100, false),
    ];

    for (const promise of attributes) {
        try {
            await promise;
            console.log("Requested attribute creation.");
        } catch (e) {
            console.log("Attribute might already exist:", e.message);
        }
    }

    console.log("Waiting for attributes to be available...");
    
    const attrsToCheck = [
        "socraticMode", "socraticSeekerId", "socraticStartedAt", "linkedQuestionId", "linkedQuestionTitle"
    ];

    for (const key of attrsToCheck) {
        for (let attempt = 0; attempt < 60; attempt++) {
            const current = await databases.getAttribute(db, discussionRoomsCollection, key);
            if (current.status === "available") {
                console.log(`Attribute ${key} is available`);
                break;
            }
            if (current.status === "failed") {
                console.error(`Attribute ${key} failed`);
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }

    console.log("Migration complete.");
}

run().catch(console.error);
