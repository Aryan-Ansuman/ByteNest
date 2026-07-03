import { db, freshnessSnapshotsCollection } from "../src/models/name";
import { databases } from "../src/models/server/config";

async function main() {
  const attrs = await databases.listAttributes(db, freshnessSnapshotsCollection);
  console.log("Attributes:");
  for (const a of attrs.attributes as any[]) {
    console.log(`- ${a.key} (${a.type}, status: ${a.status})`);
  }
}
main();
