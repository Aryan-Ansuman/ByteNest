import { databases } from "@/models/server/config";
import { discussionRoomsCollection, db } from "@/models/name";

databases
    .createStringAttribute(db, discussionRoomsCollection, "pinnedMessageId", 36, false)
    .then(() => console.log("pinnedMessageId added to discussion_rooms"))
    .catch(console.error);
