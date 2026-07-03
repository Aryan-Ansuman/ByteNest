import { IndexType, Permission } from "node-appwrite";
import { db, stalenessVotesCollection } from "../name";
import { databases } from "./config";

// One document per (answerId, userId) pair — "I tried this on version X and
// it didn't work." Distinct from a downvote: never affects totalVotes or
// author reputation, only feeds the freshness formula.
export default async function createStalenessVotesCollection() {
    await databases.createCollection(db, stalenessVotesCollection, stalenessVotesCollection, [
        Permission.create("users"),
        Permission.read("any"),
        Permission.read("users"),
        Permission.delete("users"),
    ]);
    console.log("Staleness Votes collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, stalenessVotesCollection, "answerId", 50, true),
        databases.createStringAttribute(db, stalenessVotesCollection, "userId", 50, true),
        // The version the reporter was on when the answer stopped working —
        // freeform, same tolerance as versionMax/versionMin on answers.
        databases.createStringAttribute(db, stalenessVotesCollection, "reportedVersion", 30, false),
        databases.createDatetimeAttribute(db, stalenessVotesCollection, "createdAt", true),
    ]);
    console.log("Staleness Votes Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, stalenessVotesCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`Staleness vote attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for staleness vote attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, stalenessVotesCollection, "answer_filter", IndexType.Key, ["answerId"]),
        // Enforces one staleness vote per user per answer — same role as
        // the existing vote collection's implicit one-vote-per-type constraint.
        databases.createIndex(
            db,
            stalenessVotesCollection,
            "answer_user_unique",
            IndexType.Unique,
            ["answerId", "userId"]
        ),
    ]);
    console.log("Staleness Votes indexes created");
}
