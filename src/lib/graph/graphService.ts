/**
 * High-level graph operations called by the event processor.
 * Composes nodeRepository + edgeRepository + cooccurrenceRepository.
 * This is the single entry point other features import — internals stay hidden.
 */
import { makeNodeKey } from "./nodeKey";
import { upsertQuestionNode, upsertTagNode, deriveQualityScore } from "./nodeRepository";
import { upsertStructuralEdge } from "./edgeRepository";
import { incrementCooccurrences } from "./cooccurrenceRepository";
import type { QuestionNodeAttrs } from "./types";

export type QuestionGraphInput = {
  questionId: string;
  tags: string[];
  embeddingId: string | null;
  intentLabel: string;
  intentConfidence: number;
  voteCount: number;
  answerCount: number;
  createdAt: string;
  // Tag node context — passed in so graphService doesn't query questions collection
  tagQuestionCounts: Record<string, number>;
};

/**
 * Wires a newly created question fully into the knowledge graph:
 * 1. Upserts the question node.
 * 2. Upserts each tag node (incrementing questionCount).
 * 3. Creates question_has_tag edges.
 * 4. Increments tag co-occurrence matrix.
 *
 * Called by the QuestionCreated event processor.
 * Idempotent — safe to retry on failure.
 */
export async function wireQuestionIntoGraph(
  input: QuestionGraphInput
): Promise<void> {
  const {
    questionId,
    tags,
    embeddingId,
    intentLabel,
    intentConfidence,
    voteCount,
    answerCount,
    createdAt,
    tagQuestionCounts,
  } = input;

  const qualityScore = deriveQualityScore(voteCount, answerCount);

  // 1. Upsert question node
  const questionAttrs: QuestionNodeAttrs = {
    questionId,
    tags,
    embeddingId,
    intentLabel,
    intentConfidence,
    qualityScore,
    createdAt,
  };
  await upsertQuestionNode(questionId, questionAttrs);

  // 2. Upsert tag nodes + 3. question_has_tag edges
  await Promise.all(
    tags.map(async (tag) => {
      await upsertTagNode(tag, {
        tagName: tag,
        questionCount: tagQuestionCounts[tag] ?? 1,
        relatedTagWeights: {}, // populated by cooccurrence job, not here
      });

      await upsertStructuralEdge(
        makeNodeKey("question", questionId),
        makeNodeKey("tag", tag),
        "question_has_tag",
        1.0,
        {}
      );
    })
  );

  // 4. Increment co-occurrence matrix for all tag pairs
  if (tags.length >= 2) {
    await incrementCooccurrences(tags);
  }
}
