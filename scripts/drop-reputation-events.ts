import { databases } from "../src/models/server/config";
import { db, reputationEventsCollection } from "../src/models/name";
async function run() {
  try {
    await databases.deleteCollection(db, reputationEventsCollection);
    console.log("Collection deleted");
  } catch(e) {
    console.log("Collection probably didn't exist", e);
  }
}
run();
