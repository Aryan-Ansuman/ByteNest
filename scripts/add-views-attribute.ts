// scripts/add-views-attribute.ts (run once with `npx tsx scripts/add-views-attribute.ts`)
import { databases } from "@/models/server/config";
import { db, questionCollection } from "@/models/name";

databases.createIntegerAttribute(db, questionCollection, "views", false, 0, undefined, 0)
  .then(() => console.log("views attribute added"))
  .catch(console.error);
