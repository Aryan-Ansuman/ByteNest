import { Client, Databases, IndexType } from "node-appwrite";

const endpoint = process.env.NEXT_PUBLIC_APPWRITE_HOST_URL;
const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;

if (!endpoint || !projectId || !apiKey) {
    throw new Error("Missing Appwrite environment variables; check .env");
}

const databaseId = "6a2bbffd00190eccf0b8";
const questionCollection = "questions";
const databases = new Databases(
    new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey)
);

async function run() {
    try {
        await databases.createIndex(
            databaseId,
            questionCollection,
            "isPr_filter",
            IndexType.Key,
            ["isPr"]
        );
        console.log("Successfully created index!");
    } catch (e) {
        console.error("Failed to create index:", e);
    }
}

run();
