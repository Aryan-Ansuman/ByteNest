// scripts/add-comment-parent-id-attribute.ts (run once with `npx tsx scripts/add-comment-parent-id-attribute.ts`)
import { databases } from "@/models/server/config";
import { commentCollection, db } from "@/models/name";

databases
    .createStringAttribute(db, commentCollection, "parentId", 50, false)
    .then(() => console.log("parentId attribute added"))
    .catch((error) => {
        if (error?.code === 409) {
            console.log("parentId attribute already exists");
            return;
        }

        console.error(error);
        process.exitCode = 1;
    });
