import { IndexType } from "node-appwrite";
import { databases } from "./src/models/server/config";
import { db, questionCollection, answerCollection } from "./src/models/name";

async function runMigration() {
    console.log("Starting TVA schema migration...");

    // 1. Add attributes to questionCollection
    console.log("Adding attributes to questions collection...");
    try {
        await databases.createBooleanAttribute(db, questionCollection, "hasTestSuite", false, false);
    } catch (e) { console.log("hasTestSuite might already exist:", e); }
    try {
        await databases.createStringAttribute(db, questionCollection, "testCode", 5000, false);
    } catch (e) { console.log("testCode might already exist:", e); }
    try {
        await databases.createStringAttribute(db, questionCollection, "testLanguage", 30, false);
    } catch (e) { console.log("testLanguage might already exist:", e); }
    try {
        await databases.createStringAttribute(db, questionCollection, "testFramework", 30, false);
    } catch (e) { console.log("testFramework might already exist:", e); }

    // 2. Add attributes to answerCollection
    console.log("Adding attributes to answers collection...");
    try {
        await databases.createStringAttribute(db, answerCollection, "solutionCode", 10000, false);
    } catch (e) { console.log("solutionCode might already exist:", e); }
    try {
        await databases.createStringAttribute(db, answerCollection, "solutionLanguage", 30, false);
    } catch (e) { console.log("solutionLanguage might already exist:", e); }
    try {
        await databases.createStringAttribute(db, answerCollection, "verificationStatus", 20, false, "unverified");
    } catch (e) { console.log("verificationStatus might already exist:", e); }
    try {
        await databases.createIntegerAttribute(db, answerCollection, "verificationScore", false, undefined, undefined, undefined);
    } catch (e) { console.log("verificationScore might already exist:", e); }
    try {
        await databases.createDatetimeAttribute(db, answerCollection, "lastVerifiedAt", false);
    } catch (e) { console.log("lastVerifiedAt might already exist:", e); }

    // Wait for attributes to be available before creating indexes
    console.log("Waiting for attributes to initialize...");
    await new Promise(resolve => setTimeout(resolve, 8000));

    // 3. Add indexes
    console.log("Adding indexes...");
    let success = false;
    for(let i=0; i<5; i++) {
        try {
            await databases.createIndex(db, answerCollection, "verification_sort", IndexType.Key, ["verificationStatus", "totalVotes"]);
            success = true;
            break;
        } catch (e) { 
            console.log("Index creation failed, retrying in 3s...", e);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }
    
    // 4. Ensure dbSetup runs to create test_runs
    console.log("Running dbSetup to create test_runs collection...");
    const { default: getOrCreateDB } = await import("./src/models/server/dbSetup");
    await getOrCreateDB();

    console.log("Migration complete!");
}

runMigration().catch(console.error);
