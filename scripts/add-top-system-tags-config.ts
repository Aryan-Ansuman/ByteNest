import { databases } from "@/models/server/config";
import { db, systemConfigCollection } from "@/models/name";

async function waitForAttribute(key: string) {
    for (let attempt = 0; attempt < 60; attempt++) {
        const current: any = await databases.getAttribute(db, systemConfigCollection, key);
        if (current.status === "available") return;
        if (current.status === "failed") throw new Error(`Attribute ${key} failed`);
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Timed out waiting for attribute ${key}`);
}

async function main() {
    console.log("Adding top-system-tags config attributes...");
    try {
        await databases.createStringAttribute(db, systemConfigCollection, "data", 2000, false);
        await waitForAttribute("data");
        await databases.createDatetimeAttribute(db, systemConfigCollection, "updatedAt", false);
        await waitForAttribute("updatedAt");
        console.log("✅ done");
    } catch (e: any) {
        console.error("❌", e?.message || e);
    }
}

main();
