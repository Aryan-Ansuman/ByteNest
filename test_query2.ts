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
        const docId = "6a32da780001641a056d";
        const doc = await databases.getDocument(dbId, questionCollectionId, docId);
        console.log("TITLE:", doc.title);
        console.log("CONTENT LENGTH:", doc.content.length);
        
    } catch (e) {
        console.error(e);
    }
}

run();
