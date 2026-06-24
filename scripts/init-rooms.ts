import createDiscussionRoomsCollection from "../src/models/server/discussion-rooms.collection";
import createRoomMessagesCollection from "../src/models/server/room-messages.collection";
import createRoomMembersCollection from "../src/models/server/room-members.collection";
import createCodeSessionsCollection from "../src/models/server/code-sessions.collection";
import createCollabMessagesCollection from "../src/models/server/collab-messages.collection";
import createTypingIndicatorsCollection from "../src/models/server/typing-indicators.collection";

async function main() {
    console.log("Initializing Discussion Rooms Phase 1 Collections...");
    try {
        await createDiscussionRoomsCollection();
        await createRoomMessagesCollection();
        await createRoomMembersCollection();
        await createCodeSessionsCollection();
        await createCollabMessagesCollection();
        await createTypingIndicatorsCollection();
        console.log("Successfully created all Phase 1 Collections!");
    } catch (err) {
        console.error("Failed to create collections:", err);
    }
}

main();
