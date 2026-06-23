import { databases } from "@/models/server/config";
import { db as DB } from "@/models/name";
import { ID, Query } from "node-appwrite";
import { GRAPH_COLLECTIONS } from "./collections";
import { makeCooccurrencePairKey } from "./nodeKey";
import type { TagCooccurrence } from "./types";

const COL = GRAPH_COLLECTIONS.TAG_COOCCURRENCE;

/**
 * Increments co-occurrence strength for every unique pair in a tag list.
 * Called on QuestionCreated — O(tags²) but tags per question is small (≤5).
 * Upsert via pairKey (unique index) guarantees no duplicate rows.
 */
export async function incrementCooccurrences(tags: string[]): Promise<void> {
  // Generate all unique pairs
  const pairs: [string, string][] = [];
  for (let i = 0; i < tags.length; i++) {
    for (let j = i + 1; j < tags.length; j++) {
      pairs.push([tags[i], tags[j]]);
    }
  }

  await Promise.all(pairs.map(([a, b]) => incrementPair(a, b)));
}

async function incrementPair(tagA: string, tagB: string): Promise<void> {
  const [a, b] = [tagA, tagB].sort(); // always alphabetical
  const pairKey = makeCooccurrencePairKey(a, b);

  const existing = await getByPairKey(pairKey);

  if (existing) {
    await databases.updateDocument(DB, COL, existing.$id!, {
      strength: existing.strength + 1,
    });
  } else {
    await databases.createDocument(DB, COL, ID.unique(), {
      pairKey,
      tagA: a,
      tagB: b,
      strength: 1,
    });
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getByPairKey(
  pairKey: string
): Promise<TagCooccurrence | null> {
  const res = await databases.listDocuments(DB, COL, [
    Query.equal("pairKey", pairKey),
    Query.limit(1),
  ]);

  if (res.documents.length === 0) return null;
  return deserialize(res.documents[0]);
}

/**
 * Returns the strongest co-occurring tags for a given tag.
 * Used by Tag Relationship system and future Concept node derivation.
 */
export async function getStrongestCooccurrences(
  tagName: string,
  limit = 10
): Promise<TagCooccurrence[]> {
  // Query both sides of the pair since storage is always tagA < tagB alphabetically
  const [asA, asB] = await Promise.all([
    databases.listDocuments(DB, COL, [
      Query.equal("tagA", tagName),
      Query.orderDesc("strength"),
      Query.limit(limit),
    ]),
    databases.listDocuments(DB, COL, [
      Query.equal("tagB", tagName),
      Query.orderDesc("strength"),
      Query.limit(limit),
    ]),
  ]);

  const combined = [...asA.documents, ...asB.documents]
    .map(deserialize)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit);

  return combined;
}

// ─── Serialization ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserialize(doc: any): TagCooccurrence {
  return {
    $id: doc.$id,
    pairKey: doc.pairKey,
    tagA: doc.tagA,
    tagB: doc.tagB,
    strength: doc.strength,
    updatedAt: doc.$updatedAt,
  };
}
