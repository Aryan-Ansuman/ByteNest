import { databases } from "./src/models/server/config";
import { db, questionCollection, answerCollection } from "./src/models/name";
import { Query } from "node-appwrite";

async function main() {
  try {
    let cursor = undefined;
    let updated = 0;
    while (true) {
      const queries = [Query.limit(100)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      
      const res = await databases.listDocuments(db, questionCollection, queries);
      if (res.documents.length === 0) break;
      
      for (const question of res.documents) {
        let latestActivity = question.$createdAt;
        
        // Find latest answer
        const answers = await databases.listDocuments(db, answerCollection, [
          Query.equal("questionId", question.$id),
          Query.orderDesc("$createdAt"),
          Query.limit(1)
        ]);
        
        if (answers.documents.length > 0) {
          latestActivity = answers.documents[0].$createdAt;
        }
        
        // Update if missing or mismatched
        if (!question.activityAt || question.activityAt !== latestActivity) {
          await databases.updateDocument(db, questionCollection, question.$id, {
            activityAt: latestActivity
          });
          updated++;
        }
      }
      cursor = res.documents[res.documents.length - 1].$id;
    }
    console.log(`Backfill complete. Updated ${updated} questions.`);
  } catch (err) {
    console.error(err);
  }
}
main();
