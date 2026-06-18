import { Client, Databases, Query } from "node-appwrite";

const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_HOST_URL as string)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID as string)
    .setKey(process.env.APPWRITE_API_KEY as string);

const databases = new Databases(client);

const dbId = "6a2bbffd00190eccf0b8";
const questionCollectionId = "questions";

async function run() {
    try {
        console.log("Fetching like Home page:");
        const homeQueries = [
            Query.limit(10),
            Query.orderDesc("$createdAt")
        ];
        const homeRes = await databases.listDocuments(dbId, questionCollectionId, homeQueries);
        console.log(`Home found ${homeRes.total} docs, returned ${homeRes.documents.length}`);
        console.log(homeRes.documents.map(d => d.title));

        console.log("\nFetching like Questions page:");
        const limit = 20;
        const qQueries = [
            Query.orderDesc("$createdAt"),
            Query.offset(0),
            Query.limit(limit),
        ];
        const qRes = await databases.listDocuments(dbId, questionCollectionId, qQueries);
        console.log(`Questions page found ${qRes.total} docs, returned ${qRes.documents.length}`);
        console.log(qRes.documents.map(d => d.title));
        
    } catch (e) {
        console.error(e);
    }
}

run();
