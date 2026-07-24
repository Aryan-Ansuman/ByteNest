import { IndexType } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, questionCollection } from "@/models/name";

async function waitForAttribute(key: string, attemptLimit = 60) {
    for (let attempt = 0; attempt < attemptLimit; attempt++) {
        const current: any = await databases.getAttribute(db, questionCollection, key);
        if (current.status === "available") return;
        if (current.status === "failed") {
            throw new Error(`Attribute ${key} failed to initialize`);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Timed out waiting for attribute ${key}`);
}

async function main() {
    console.log("Adding hasBranches attribute to questions collection...");

    try {
        // Nullable boolean, no default — a low-stakes denormalized hint,
        // never reset to false once true (see Phase 0, Decision 8 in the
        // branching plan), so absent/null and "known false" don't need to
        // be distinguished from each other here.
        await databases.createBooleanAttribute(db, questionCollection, "hasBranches", false);
        console.log("hasBranches attribute created, waiting for it to become available...");
        await waitForAttribute("hasBranches");

        console.log("Creating has_branches_filter index...");
        await databases.createIndex(
            db,
            questionCollection,
            "has_branches_filter",
            IndexType.Key,
            ["hasBranches"]
        );

        console.log("✅ hasBranches attribute + index ready.");
    } catch (e: any) {
        console.error("❌ Failed to add hasBranches:", e?.message || e);
    }
}

main();
