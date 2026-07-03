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

        // ─── Test-Verified Answers (TVA) ────────────────────────────────
        // Whether this question carries an executable test suite. Gates the
        // "Add Test Suite" UI on answers and the verification trigger on
        // answer submission. Opt-in — most questions won't have one.
        databases.createBooleanAttribute(db, questionCollection, "hasTestSuite", false, false),
        // Raw test file content (Jest/pytest/etc). Kept as a dedicated field
        // rather than regex-extracted from `content` markdown — code blocks
        // in markdown are not a reliable execution source.
        databases.createStringAttribute(db, questionCollection, "testCode", 5000, false),
        databases.createStringAttribute(db, questionCollection, "testLanguage", 30, false),
        // jest | pytest | vitest | cargo-test | go-test — see TEST_FRAMEWORKS in models/name.ts
        databases.createStringAttribute(db, questionCollection, "testFramework", 30, false),
        // Phase 7 — denormalized so the similarity pipeline's Stage-1 batch fetch
        // (already reading question docs) can bias ranking without a second query
        // per candidate. "Sticky" once true: if a passing answer later fails a
        // retroactive re-check, this is recomputed (not just flipped false) by
        // checking whether any OTHER answer on the question is still passing.
        databases.createBooleanAttribute(db, questionCollection, "hasVerifiedAnswer", false, false),

        // ─── Temporal Answer Decay System — Phase 8 ─────────────────────
        // Derived, denormalized dot shown on question cards: "fresh" (green,
        // at least one fresh/aging answer), "outdated" (amber, has answers
        // but all outdated/stale), "none" (grey, no answers yet). Kept on
        // the question doc rather than computed client-side per card so the
        // /questions list page can render it without fetching every
        // question's answers. See lib/decay/question-freshness-indicator.ts.
        databases.createEnumAttribute(db, questionCollection, "answerFreshnessIndicator", ["fresh", "outdated", "none"], false, "none"),
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
        databases.createIndex(db, questionCollection, "has_test_suite_filter", IndexType.Key, ["hasTestSuite"]),
        databases.createIndex(db, questionCollection, "has_verified_answer_filter", IndexType.Key, ["hasVerifiedAnswer"]),
        databases.createIndex(db, questionCollection, "answer_freshness_indicator_filter", IndexType.Key, ["answerFreshnessIndicator"]),
    ]);
    console.log("Question indexes created");
}
