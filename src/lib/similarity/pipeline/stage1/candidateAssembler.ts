import type { TagFilterCandidate } from "./tagFilter";
import { filterByTagOverlap } from "./tagFilter";
import { filterByTechTerms, extractTechTerms } from "./techFilter";
import { filterByPopularity } from "./popularityFilter";

import { databases } from "@/models/server/config";
import { db as DB, questionCollection as QUESTIONS_COL } from "@/models/name";
import { Query } from "node-appwrite";

const TARGET_MIN = 50;
const TARGET_MAX = 150;

export type Stage1Result = {
  candidates: TagFilterCandidate[];
  preFilterCount: number;
  postTechFilterCount: number;
  postPopularityFilterCount: number;
  finalCount: number;
};

/**
 * Step 6.1–6.6 — Full Stage 1 candidate generation.
 * Applies tag → tech → popularity filters in sequence.
 * Targets 50–150 candidates for Stage 2 semantic ranking.
 */
export async function assembleStage1Candidates(params: {
  sourceTags: string[];
  sourceTitle: string;
  sourceBody: string;
  sourceQuestionId?: string; // exclude self if re-ranking an existing question
}): Promise<Stage1Result> {
  const { sourceTags, sourceTitle, sourceBody, sourceQuestionId } = params;

  // Step 6.2 — Tag overlap
  let effectiveTags = sourceTags;
  if (effectiveTags.length === 0) {
    const extracted = await extractTechTerms(sourceTitle + " " + sourceBody);
    effectiveTags = Array.from(extracted);
  }

  let candidates = await filterByTagOverlap(effectiveTags);
  console.log("[Assembler] filterByTagOverlap count:", candidates.length);

  // Fallback for draft flow if no tags or tech terms were matched,
  // or the tag graph returned 0 results. We use fulltext search on title.
  if (candidates.length === 0) {
    // Take the most significant words from title (up to 5 words)
    const searchTerms = sourceTitle.split(/\s+/).filter(w => w.length > 3).slice(0, 5).join(" ");
    console.log("[Assembler] Fallback searchTerms:", searchTerms);
    if (searchTerms) {
      const res = await databases.listDocuments(DB, QUESTIONS_COL, [
        Query.search("title", searchTerms),
        Query.limit(50),
      ]);
      console.log("[Assembler] Fallback res count:", res.documents.length);
      candidates = res.documents.map((doc: any) => ({
        questionId: doc.$id,
        tags: doc.tags ?? [],
        voteCount: doc.totalVotes ?? doc.voteCount ?? 0,
        hasAcceptedAnswer: !!doc.acceptedAnswerId,
        createdAt: doc.$createdAt,
      }));
    }
  }

  // Exclude self from candidate set
  if (sourceQuestionId) {
    candidates = candidates.filter((c) => c.questionId !== sourceQuestionId);
  }

  const preFilterCount = candidates.length;

  // Step 6.3 — Tech term extraction
  candidates = await filterByTechTerms(candidates, sourceTitle, sourceBody);
  const postTechFilterCount = candidates.length;
  console.log("[Assembler] postTechFilterCount:", postTechFilterCount);

  // Step 6.4 — Popularity floor
  candidates = filterByPopularity(candidates);
  const postPopularityFilterCount = candidates.length;
  console.log("[Assembler] postPopularityFilterCount:", postPopularityFilterCount);

  // Step 6.6 — If over target maximum, keep highest-voted for Stage 2 efficiency
  if (candidates.length > TARGET_MAX) {
    candidates = candidates
      .sort((a, b) => b.voteCount - a.voteCount)
      .slice(0, TARGET_MAX);
  }

  return {
    candidates,
    preFilterCount,
    postTechFilterCount,
    postPopularityFilterCount,
    finalCount: candidates.length,
  };
}
