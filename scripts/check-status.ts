import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
    const { databases } = await import("../src/models/server/config");
    const { db, questionCollection } = await import("../src/models/name");
    const questionId = "6a48e99b002422b63a86";
    const doc = await databases.getDocument(db, questionCollection, questionId);
    console.log("Status:", doc.smellAnalysisStatus);
    console.log("systemTags:", doc.systemTags);
    console.log("smellEvidence:", doc.smellEvidence);
    console.log("content:", doc.content.slice(0, 50));
}

main().catch(console.error);
