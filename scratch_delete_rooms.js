const { Client, Databases } = require('node-appwrite');

const client = new Client()
    .setEndpoint('https://sgp.cloud.appwrite.io/v1')
    .setProject('6a2a94690035eff3c195')
    .setKey('standard_011fde8ca921a789e8bbe1042befcd0fa4e7bbfb38ca12276e107e62ed6bddc0a30e708fafecdd4799f91e9f682cdf28b89cb3c399bde2a434cfd900554fa68a069f20f22ca55d89b5c7bfc9700dfe8574e23e313d3e642c3a5d648b9039b165c7972152ea969aa07a61d0091423f0035587693e1fd3e43f3ec29a0bda88fcf9');

const databases = new Databases(client);

const dbId = '6a2bbffd00190eccf0b8';
const collections = [
    'discussion_rooms',
    'room_messages',
    'room_members',
    'code_sessions',
    'collab_messages',
    'typing_indicators'
];

async function deleteAllDocs(collectionId) {
    try {
        let hasMore = true;
        let deletedCount = 0;
        
        while (hasMore) {
            const response = await databases.listDocuments(dbId, collectionId);
            if (response.documents.length === 0) {
                hasMore = false;
                break;
            }
            
            for (const doc of response.documents) {
                await databases.deleteDocument(dbId, collectionId, doc.$id);
                deletedCount++;
            }
        }
        
        console.log(`Deleted ${deletedCount} documents from ${collectionId}`);
    } catch (e) {
        console.error(`Error deleting from ${collectionId}:`, e.message);
    }
}

async function run() {
    for (const col of collections) {
        await deleteAllDocs(col);
    }
    console.log('Finished cleanup');
}

run();
