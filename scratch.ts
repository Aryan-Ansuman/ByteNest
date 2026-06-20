import { databases } from "./src/models/server/config";
import { db, questionCollection } from "./src/models/name";
import { Query } from "node-appwrite";

async function main() {
  try {
    const res = await databases.listDocuments(db, questionCollection, [Query.limit(1)]);
    console.log(res.documents[0]);
  } catch (err) {
    console.error(err);
  }
}
main();
