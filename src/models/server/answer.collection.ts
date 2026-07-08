import { IndexType, Permission } from "node-appwrite";
import { answerCollection, db } from "../name";
import { databases } from "./config";

export default async function createAnswerCollection() {
    await databases.createCollection(db, answerCollection, answerCollection, [
        Permission.create("users"),
        Permission.read("any"),
        Permission.read("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Answer Collection Created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, answerCollection, "content", 10000, true),
        databases.createStringAttribute(db, answerCollection, "questionId", 50, true),
        databases.createStringAttribute(db, answerCollection, "authorId", 50, true),
        // Denormalized vote counter — incremented/decremented by the vote API.
        databases.createIntegerAttribute(db, answerCollection, "totalVotes", false, undefined, undefined, 0),
        // True only when the question author explicitly marks this answer as accepted.
        // Defaults false; only one answer per question should ever be true at a time
        // (enforced by the PATCH /api/answer endpoint).
        databases.createBooleanAttribute(db, answerCollection, "isAccepted", false, false),

        // ─── Test-Verified Answers (TVA) ────────────────────────────────
        databases.createStringAttribute(db, answerCollection, "solutionCode", 10000, false),
        databases.createStringAttribute(db, answerCollection, "solutionLanguage", 30, false),
        databases.createStringAttribute(db, answerCollection, "verificationStatus", 20, false, "unverified"),
        databases.createIntegerAttribute(db, answerCollection, "verificationScore", false, undefined, undefined, undefined),
        databases.createDatetimeAttribute(db, answerCollection, "lastVerifiedAt", false),

        // ─── Temporal Answer Decay System ───────────────────────────────
        // Decision 1: version metadata is owned by the answerer, not the
        // question. Both nullable — most answers won't carry version tags.
        databases.createStringAttribute(db, answerCollection, "versionMin", 30, false),
        databases.createStringAttribute(db, answerCollection, "versionMax", 30, false),
        databases.createStringAttribute(db, answerCollection, "techPackage", 100, false),
        databases.createEnumAttribute(db, answerCollection, "techEcosystem", ["npm", "pypi", "crates", "github"], false),

        // Computed by the nightly job (Phase 3) and the event-driven
        // recompute path (staleness votes, Phase 5). Score defaults to 100
        // so a brand-new answer starts "fresh" until first processed.
        databases.createFloatAttribute(db, answerCollection, "freshnessScore", false, 0, 100, 100),
        // Stored directly (not derived at query time) so Appwrite queries —
        // filtered listing, the nightly job's own bookkeeping — can filter
        // on it without arithmetic.
        databases.createEnumAttribute(db, answerCollection, "freshnessLabel", ["fresh", "aging", "outdated", "stale"], false, "fresh"),

        // Denormalized from staleness_votes — same pattern as totalVotes.
        databases.createIntegerAttribute(db, answerCollection, "stalenessVoteCount", false, undefined, undefined, 0),

        // Null = never processed by the nightly job yet.
        databases.createDatetimeAttribute(db, answerCollection, "lastFreshnessCheck", false),
        // Set when the author clicks "Still valid". Resets the effective
        // age used by the time multiplier and suppresses notifications for
        // AUTHOR_VERIFICATION_SUPPRESSION_DAYS (see lib/decay/config.ts).
        databases.createDatetimeAttribute(db, answerCollection, "verifiedByAuthorAt", false),
        // Tracks the last outdated/stale notification sent to the author —
        // prevents re-notifying inside NOTIFICATION_RETHROTTLE_DAYS.
        databases.createDatetimeAttribute(db, answerCollection, "freshnessNotifiedAt", false),

        // ─── PR-Linked Q&A (Phase 4) ─────────────────────────────────────
        // Decision 3: extends this collection rather than a separate table
        // so votes/comments/reputation/skill-scoring keep pointing at this
        // same answer $id. Both nullable — non-null only when the answerer
        // clicked a specific diff line; null means a general PR answer.
        // JSON-encoded { filePath: string, lineNumber: number, side: "left" | "right" }.
        databases.createStringAttribute(db, answerCollection, "diffLineRef", 500, false),
        // Snapshot of the 3–5 lines around the anchor at answer-creation
        // time, so the answer still displays correctly if the diff is
        // later refreshed (Phase 8) and the original line shifts/vanishes.
        databases.createStringAttribute(db, answerCollection, "diffLineContext", 2000, false),
    ]);
    console.log("Answer Attributes Created");

    // Appwrite creates attributes asynchronously — index creation must wait
    // until every referenced attribute is available.
    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, answerCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`Answer attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for answer attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        // Filtered listing (e.g. "show me outdated answers") and the future
        // Phase 8 freshness-sort integration.
        databases.createIndex(db, answerCollection, "freshness_label_filter", IndexType.Key, ["freshnessLabel"]),
        // Phase 8 — powers the "Freshness" answer sort option (freshnessScore DESC).
        databases.createIndex(db, answerCollection, "freshness_score_sort", IndexType.Key, ["freshnessScore"]),
        // Lets the nightly job efficiently find answers due for reprocessing
        // via cursor pagination ordered by staleness of the last check.
        databases.createIndex(db, answerCollection, "last_freshness_check_sort", IndexType.Key, ["lastFreshnessCheck"]),
    ]);
    console.log("Answer indexes created");
}
