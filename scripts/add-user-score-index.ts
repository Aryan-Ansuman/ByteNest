import * as fs from "fs";
import { Client, Databases, IndexType } from "node-appwrite";

const env = fs
    .readFileSync(".env", "utf8")
    .split("\n")
    .reduce<Record<string, string>>((acc, line) => {
        const [key, ...val] = line.split("=");
        if (key?.trim()) acc[key.trim()] = val.join("=").trim().replace(/"/g, "");
        return acc;
    }, {});

const ENDPOINT   = env.NEXT_PUBLIC_APPWRITE_HOST_URL;
const PROJECT_ID = env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
const API_KEY    = env.APPWRITE_API_KEY;

const client = new Client().setEndpoint(ENDPOINT!).setProject(PROJECT_ID!).setKey(API_KEY!);
const databases = new Databases(client);

const DB_ID = "6a2bbffd00190eccf0b8";
const USER_SKILL_SCORES_COLL = "user_skill_scores";

async function main() {
    console.log("Creating userId_score_sort index on user_skill_scores collection...");
    try {
        await databases.createIndex(
            DB_ID,
            USER_SKILL_SCORES_COLL,
            "userId_score_sort",
            IndexType.Key,
            ["userId", "compositeScore"],
            ["ASC", "DESC"]
        );
        console.log("✅ Index created successfully.");
    } catch (e: any) {
        console.error("❌ Failed to create index:", e?.message || e);
    }
}

main();
