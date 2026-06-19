import { databases } from "@/models/server/config";
import { commentCollection, db } from "@/models/name";

databases.createBooleanAttribute(db, commentCollection, "isDeleted", false, false).then(() => console.log("isDeleted added")).catch(console.error);
