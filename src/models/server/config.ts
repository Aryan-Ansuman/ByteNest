import env from "@/app/env";

import {Avatars, Client, Databases, Storage, Users} from "node-appwrite"

const appwriteApiKey = process.env.APPWRITE_API_KEY;
if (!appwriteApiKey) {
    throw new Error("Missing required environment variable: APPWRITE_API_KEY");
}

let client = new Client();

client
    .setEndpoint(env.appwrite.endpoint) // Your API Endpoint
    .setProject(env.appwrite.projectId) // Your project ID
    .setKey(appwriteApiKey) // Your secret API key
    
;

const databases = new Databases(client)
const avatars = new Avatars(client);
const storage = new Storage(client);
const users = new Users(client)


export { client, databases, users, avatars, storage}
