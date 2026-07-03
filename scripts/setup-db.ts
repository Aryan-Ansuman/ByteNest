import getOrCreateDB from "../src/models/server/dbSetup";

async function main() {
  console.log("Running getOrCreateDB...");
  await getOrCreateDB();
  console.log("Done!");
}

main().catch(console.error);
