const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
    const [key, ...val] = line.split('=');
    if (key) acc[key.trim()] = val.join('=').trim().replace(/"/g, '');
    return acc;
}, {});
const { Client, Databases } = require('node-appwrite');
const client = new Client().setEndpoint(env.NEXT_PUBLIC_APPWRITE_HOST_URL).setProject(env.NEXT_PUBLIC_APPWRITE_PROJECT_ID).setKey(env.APPWRITE_API_KEY);
const databases = new Databases(client);
databases.getDocument('6a2bbffd00190eccf0b8', 'questions', '6a34f6d4002b1df75c2d').then(doc => console.log("TOTAL VOTES:", doc.totalVotes)).catch(console.error);
