import { Client, Databases } from "node-appwrite";

async function run() {
    console.log("Migrating Socratic Mode attributes on discussion_rooms...");

    const client = new Client();
    client
        .setEndpoint("https://sgp.cloud.appwrite.io/v1")
        .setProject("6a2a94690035eff3c195")
        .setKey("standard_011fde8ca921a789e8bbe1042befcd0fa4e7bbfb38ca12276e107e62ed6bddc0a30e708fafecdd4799f91e9f682cdf28b89cb3c399bde2a434cfd900554fa68a069f20f22ca55d89b5c7bfc9700dfe8574e23e313d3e642c3a5d648b9039b165c7972152ea969aa07a61d0091423f0035587693e1fd3e43f3ec29a0bda88fcf9");

    const databases = new Databases(client);
    
    // DB ID from name.ts (which is 'qna-db')
    // Wait, let's look up db id and collection ID from name.ts to be safe!
    // But since the setup uses standard names, db is usually "qna-db" or something, but let's just grep name.ts.
}

run().catch(console.error);
