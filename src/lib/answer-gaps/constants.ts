/**
 * Answer Gap Detector — Phase 1
 * Gap query constants and index documentation.
 *
 * Step 1.3 — Time window constants (never use magic numbers in query logic)
 * Step 1.4 — Index audit findings + remediation
 */

// ─── Step 1.3: Time window constants ─────────────────────────────────────────

/** Minimum age before a question is considered "genuinely unanswered".
 *  Newly posted questions may just be waiting for the first response. */
export const GAP_MIN_AGE_HOURS = 2;

/** Maximum age beyond which questions are likely abandoned or too niche. */
export const GAP_MAX_AGE_DAYS = 7;

/** Derived ms values — use these in Date arithmetic, not the raw constants above. */
export const GAP_MIN_AGE_MS  = GAP_MIN_AGE_HOURS * 60 * 60 * 1000;
export const GAP_MAX_AGE_MS  = GAP_MAX_AGE_DAYS  * 24 * 60 * 60 * 1000;

/** How many of the user's top skill tags to query gaps for. */
export const GAP_TOP_TAGS_LIMIT = 5;

/** Maximum number of gap questions surfaced per tag query before merge+sort. */
export const GAP_PER_TAG_FETCH_LIMIT = 10;

/** Final number of gap questions returned to the client. */
export const GAP_RESULT_LIMIT = 3;

/** Server-side cache TTL per user (ms). */
export const GAP_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Rate limit: max requests per user per window. */
export const GAP_RATE_LIMIT        = 20;
export const GAP_RATE_WINDOW_MS    = 60 * 1000; // 1 minute

/**
 * Compute the ISO timestamp boundaries for the gap time window.
 * Call this at request time so the window is always relative to "now".
 */
export function gapTimeWindow(now = new Date()): { earliest: string; latest: string } {
    const nowMs = now.getTime();
    return {
        // Questions must be OLDER than this (posted > GAP_MIN_AGE_HOURS ago)
        latest:   new Date(nowMs - GAP_MIN_AGE_MS).toISOString(),
        // Questions must be NEWER than this (posted < GAP_MAX_AGE_DAYS ago)
        earliest: new Date(nowMs - GAP_MAX_AGE_MS).toISOString(),
    };
}


// ─── Step 1.4: Index audit findings ──────────────────────────────────────────
//
// EXISTING INDEXES on the `questions` collection (from question.collection.ts):
//
//   title_fulltext   — Fulltext on ["title"]
//   content_fulltext — Fulltext on ["content"]
//   votes_sort       — Key on ["totalVotes"]
//   answers_filter   — Key on ["totalAnswers"]          ← used by gap query
//   activity_sort    — Key on ["activityAt"]
//
// EXISTING INDEXES on `user_skill_scores` (from user-skill-scores.collection.ts):
//
//   userId_index         — Key on ["userId"]
//   tag_index            — Key on ["tag"]
//   userId_tag_unique    — Unique on ["userId", "tag"]
//   tag_score_sort       — Key on ["tag", "compositeScore"]
//   lastCalculatedAt_index — Key on ["lastCalculatedAt"]
//
// ── Gap query breakdown ───────────────────────────────────────────────────────
//
// Query 1 (user_skill_scores):
//   WHERE userId = :userId
//   ORDER BY compositeScore DESC
//   LIMIT 5
//
//   VERDICT: ✅ COVERED by `userId_index`.
//   Appwrite will use userId_index for filtering; compositeScore sort is
//   applied in-memory over the small result set (max ~50 tag docs per user).
//   Expected latency: < 20ms.
//   NO NEW INDEX NEEDED.
//
// Query 2 (questions) — repeated once per skill tag:
//   WHERE tags CONTAINS :tag
//   AND   totalAnswers = 0
//   AND   $createdAt < :latest      (older than 2 hours)
//   AND   $createdAt > :earliest    (newer than 7 days)
//   AND   authorId != :userId       (exclude own questions)
//   ORDER BY $createdAt ASC         (oldest unanswered first → highest urgency)
//   LIMIT 10
//
//   EXISTING COVERAGE:
//   - `answers_filter` covers `totalAnswers = 0` ✅
//   - `$createdAt` is a system attribute — Appwrite indexes it by default ✅
//   - `tags` array contains filter uses Appwrite's built-in array indexing ✅
//
//   APPWRITE QUERY PLANNER BEHAVIOUR:
//   Appwrite (v1.x) applies filters sequentially. With `totalAnswers = 0`
//   filtered first via `answers_filter`, the candidate set is small enough
//   that the subsequent $createdAt range filter and tags contains filter
//   run cheaply over it. On a platform with < 100k questions this is fine.
//
//   MISSING / POTENTIALLY SLOW:
//   There is NO composite index on (totalAnswers, $createdAt) or
//   (tags, totalAnswers). For a high-volume platform (> 500k questions) you
//   would want a composite index. For ByteNest's current scale, the existing
//   single-column indexes are sufficient.
//
//   VERDICT: ✅ NO NEW INDEX REQUIRED at current scale.
//   Document this note so it is easy to add later if needed.
//
// ── user_skill_scores top-5 sort verification ────────────────────────────────
//
//   The widget needs: userId = X ORDER BY compositeScore DESC LIMIT 5
//
//   `userId_index` is a Key index on ["userId"] only. Appwrite will filter
//   by userId (fast) then sort the returned documents by compositeScore.
//   Because a user is unlikely to have more than ~30 skill tag documents,
//   the in-memory sort is negligible.
//
//   If a user somehow accumulates hundreds of tag scores (power user on a
//   very large platform), add this index:
//     databases.createIndex(db, userSkillScoresCollection,
//       "userId_score_sort", IndexType.Key, ["userId", "compositeScore"])
//
//   For now: NOT NEEDED. Noted for future scale.
//
// ─────────────────────────────────────────────────────────────────────────────
