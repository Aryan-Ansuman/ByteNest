import { IndexType, Permission } from "node-appwrite";
import { db, questionCollection } from "../name";
import { databases } from "./config";

export default async function createQuestionCollection() {
    await databases.createCollection(db, questionCollection, questionCollection, [
        Permission.read("any"),
        Permission.read("users"),
        Permission.create("users"),
        Permission.update("users"),
        Permission.delete("users"),
    ]);
    console.log("Question collection is created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, questionCollection, "title", 100, true),
        databases.createStringAttribute(db, questionCollection, "content", 10000, true),
        databases.createStringAttribute(db, questionCollection, "authorId", 50, true),
        databases.createStringAttribute(db, questionCollection, "tags", 50, true, undefined, true),
        databases.createStringAttribute(db, questionCollection, "attachmentId", 50, false),
        databases.createStringAttribute(db, questionCollection, "acceptedAnswerId", 50, false),
        databases.createIntegerAttribute(db, questionCollection, "views", false, 0, undefined, 0),
        // Denormalized vote counter — incremented/decremented by the vote API.
        // Eliminates the need to list all vote documents just to get a count,
        // and removes the VOTE_LIMIT ceiling problem entirely.
        databases.createIntegerAttribute(db, questionCollection, "totalVotes", false, undefined, undefined, 0),
        // Kept in sync by the answer API so unanswered filtering is correct
        // before pagination is applied.
        databases.createIntegerAttribute(db, questionCollection, "totalAnswers", false, 0, undefined, 0),
        // Latest question edit or answer mutation, used by the Active sort.
        databases.createDatetimeAttribute(db, questionCollection, "activityAt", false),

        // ─── Code Smell Auto-Tagger (Phase 5) ───────────────────────────
        // Decision 3: lives directly on the question document, separate
        // from the user-provided `tags` field above — never merged with it,
        // never participates in tag-expert-registry / skill scoring / the
        // similarity engine's tag inputs. Left unset (not []) until a
        // worker actually writes to it, so "never analyzed" and "analyzed,
        // found nothing" stay distinguishable.
        databases.createStringAttribute(db, questionCollection, "systemTags", 50, false, undefined, true),
        // pending | processing | complete | failed | skipped — see
        // SMELL_ANALYSIS_STATUSES in lib/smells/catalog.ts. No default —
        // null means never queued.
        databases.createEnumAttribute(
            db,
            questionCollection,
            "smellAnalysisStatus",
            ["pending", "processing", "complete", "failed", "skipped"],
            false
        ),
        databases.createDatetimeAttribute(db, questionCollection, "smellAnalysisAt", false),
        // SHA-256 hex of the content that was last analyzed — Decision 5's
        // edit-guard compares against this before requeuing analysis.
        databases.createStringAttribute(db, questionCollection, "smellContentHash", 64, false),
        // JSON-encoded SmellEvidence[] — display-only, deliberately not
        // structured/queryable so systemTags stays the clean filterable field.
        databases.createStringAttribute(db, questionCollection, "smellEvidence", 5000, false),
        // JSON-encoded SmellFeedbackSummary — denormalized from smell_feedback
        // (Phase 7) so the UI never aggregates on render.
        databases.createStringAttribute(db, questionCollection, "smellFeedbackSummary", 2000, false),
    ]);
    console.log("Question Attributes created");

    // Appwrite creates attributes asynchronously. Index creation must wait
    // until every referenced attribute is available.
    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(
                    db,
                    questionCollection,
                    attribute.key
                );
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`Question attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for question attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(db, questionCollection, "title_fulltext", IndexType.Fulltext, ["title"]),
        databases.createIndex(db, questionCollection, "content_fulltext", IndexType.Fulltext, ["content"]),
        databases.createIndex(db, questionCollection, "votes_sort", IndexType.Key, ["totalVotes"]),
        databases.createIndex(db, questionCollection, "answers_filter", IndexType.Key, ["totalAnswers"]),
        databases.createIndex(db, questionCollection, "activity_sort", IndexType.Key, ["activityAt"]),

        // ─── Code Smell Auto-Tagger (Phase 5) ───────────────────────────
        databases.createIndex(db, questionCollection, "smell_status_filter", IndexType.Key, ["smellAnalysisStatus"]),
        // databases.createIndex(db, questionCollection, "system_tags_filter", IndexType.Key, ["systemTags"]),
        databases.createIndex(db, questionCollection, "smell_analysis_at_sort", IndexType.Key, ["smellAnalysisAt"]),
        // Composite — the worker's actual queue-drain query: pending/failed
        // jobs ordered by when they were last touched.
        databases.createIndex(
            db,
            questionCollection,
            "smell_status_analysis_at_composite",
            IndexType.Key,
            ["smellAnalysisStatus", "smellAnalysisAt"]
        ),
    ]);
    console.log("Question indexes created");
}
