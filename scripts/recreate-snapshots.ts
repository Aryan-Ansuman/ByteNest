import { db, freshnessSnapshotsCollection } from "../src/models/name";
import { databases } from "../src/models/server/config";
import createFreshnessSnapshotsCollection from "../src/models/server/freshness-snapshots.collection";

async function recreate() {
  console.log("Deleting snapshots collection...");
  try {
    await databases.deleteCollection(db, freshnessSnapshotsCollection);
    console.log("Deleted.");
  } catch (err: any) {
    console.log("Delete failed:", err.message);
  }
  
  console.log("Recreating...");
  await createFreshnessSnapshotsCollection();
  console.log("Done.");
}

recreate();
