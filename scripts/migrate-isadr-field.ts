import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    envConfig.split("\n").forEach((line) => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            process.env[match[1].trim()] = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
        }
    });
}

import { db, questionCollection } from "../src/models/name";
import { databases } from "../src/models/server/config";

async function main() {
    console.log("Migrating questions collection to add isAdr boolean attribute...");
    try {
        await databases.createBooleanAttribute(
            db,
            questionCollection,
            "isAdr",
            false,
            false, // default false
            false // array false
        );
        console.log("Successfully added isAdr attribute to questions collection.");
    } catch (e: any) {
        if (e.code === 409) {
            console.log("isAdr attribute already exists. Continuing.");
        } else {
            console.error("Failed to create isAdr attribute:", e.message);
        }
    }
}

main().catch(console.error);
