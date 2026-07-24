import { Client, Databases } from "node-appwrite";

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1")
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);

const databases = new Databases(client);

const DB_ID = "6a2bbffd00190eccf0b8";
const SYSTEM_CONFIG_COLLECTION = "system_config";

async function main() {
    console.log("Migrating Phase 8 ADR consensus config...");
    
    try {
        await databases.createDocument(DB_ID, SYSTEM_CONFIG_COLLECTION, "adr_consensus", {
            minConsensusMargin: 1.0,
        });
        console.log("✅ Seeded adr_consensus configuration.");
    } catch (err: any) {
        if (err?.code === 409) {
            console.log("⚠️ adr_consensus configuration already exists. Skipping.");
        } else {
            console.error("❌ Failed to seed adr_consensus configuration:", err);
        }
    }
}

main().catch(console.error);
