import { databases } from "@/models/server/config";
import { db as DB, technologyTermsCollection as TECH_TERMS_COL } from "@/models/name";
import { Query } from "node-appwrite";
import type { TagFilterCandidate } from "./tagFilter";

// In-process cache — refreshed every 10 minutes
let termCache: Set<string> | null = null;
let termCacheBuiltAt = 0;
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Step 6.3 — Technology term extraction.
 * Loads the technology_terms collection into a local set.
 * Every tag added to ByteNest is automatically a technology term.
 */
async function getTechTerms(): Promise<Set<string>> {
  if (termCache && Date.now() - termCacheBuiltAt < CACHE_TTL_MS) {
    return termCache;
  }

  const terms = new Set<string>();
  let cursor: string | undefined;

  do {
    const queries = [Query.limit(500)];
    if (cursor) queries.push(Query.cursorAfter(cursor));

    const res = await databases.listDocuments(DB, TECH_TERMS_COL, queries);
    if (res.documents.length === 0) break;

    for (const doc of res.documents) {
      terms.add((doc.term as string).toLowerCase());
    }

    cursor = res.documents[res.documents.length - 1].$id;
  } while (true);

  termCache = terms;
  termCacheBuiltAt = Date.now();
  return terms;
}

/**
 * Extracts technology terms mentioned in a block of text.
 * Matches whole words only — avoids "react" matching "reactive".
 */
export async function extractTechTerms(text: string): Promise<Set<string>> {
  const terms = await getTechTerms();
  const lower = text.toLowerCase();
  const found = new Set<string>();

  for (const term of terms) {
    // Whole-word boundary check using a simple regex
    const pattern = new RegExp(`(?<![a-z0-9])${escapeRegex(term)}(?![a-z0-9])`, "i");
    if (pattern.test(lower)) {
      found.add(term);
    }
  }

  return found;
}

/**
 * Step 6.3 — Technology extraction filtering.
 * Keeps only candidates whose stored tags overlap with the source tech terms.
 * Falls back to returning all candidates if no source tech terms are found.
 */
export async function filterByTechTerms(
  candidates: TagFilterCandidate[],
  sourceTitle: string,
  sourceBody: string
): Promise<TagFilterCandidate[]> {
  const sourceTechTerms = await extractTechTerms(sourceTitle + " " + sourceBody);

  // If we can't identify any tech terms, skip this filter — don't over-filter
  if (sourceTechTerms.size === 0) return candidates;

  return candidates.filter((c) => {
    const candidateTags = c.tags.map((t) => t.toLowerCase());
    return candidateTags.some((tag) => sourceTechTerms.has(tag));
  });
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
