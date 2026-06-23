import { databases } from "@/models/server/config";
import { db as DB, questionCollection as QUESTIONS_COL } from "@/models/name";
import { Query } from "node-appwrite";
import { makeNodeKey } from "@/lib/graph/nodeKey";
import { getEdgesToTarget } from "@/lib/graph/edgeRepository";

export type TagFilterCandidate = {
  questionId: string;
  tags: string[];
  voteCount: number;
  hasAcceptedAnswer: boolean;
  createdAt: string;
};

/**
 * Step 6.2 — Tag filtering.
 * Two-hop graph traversal: source tags → question_has_tag edges (reverse) → candidate questionIds.
 * Uses the graph_edges collection built in Part 3 — no full table scan.
 */
export async function filterByTagOverlap(
  sourceTags: string[]
): Promise<TagFilterCandidate[]> {
  if (sourceTags.length === 0) return [];

  // Hop 1: for each source tag, get all questionIds sharing that tag
  const tagNodeKeys = sourceTags.map((t) => makeNodeKey("tag", t));

  const edgeSets = await Promise.all(
    tagNodeKeys.map((tagKey) =>
      getEdgesToTarget(tagKey, "question_has_tag", 2000)
    )
  );

  // Deduplicate questionIds across all tag edges
  const questionIdSet = new Set<string>();
  for (const edges of edgeSets) {
    for (const edge of edges) {
      // sourceId is "question:questionId" — strip the prefix
      const questionId = edge.sourceId.replace(/^question:/, "");
      questionIdSet.add(questionId);
    }
  }

  if (questionIdSet.size === 0) return [];

  // Hop 2: fetch question metadata for all candidate ids
  // Appwrite Query.equal supports array up to 100 — batch if needed
  const questionIds = Array.from(questionIdSet);
  const batches = chunkArray(questionIds, 100);

  const docs: TagFilterCandidate[] = [];

  await Promise.all(
    batches.map(async (batch) => {
      const res = await databases.listDocuments(DB, QUESTIONS_COL, [
        Query.equal("$id", batch),
        Query.limit(batch.length),
      ]);

      for (const doc of res.documents) {
        docs.push({
          questionId: doc.$id,
          tags: doc.tags ?? [],
          voteCount: doc.voteCount ?? 0,
          hasAcceptedAnswer: !!doc.acceptedAnswerId,
          createdAt: doc.$createdAt,
        });
      }
    })
  );

  return docs;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
