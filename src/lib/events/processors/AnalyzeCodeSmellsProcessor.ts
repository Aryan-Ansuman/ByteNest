import type { AnalyzeCodeSmellsPayload } from "../types";
import { db, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { publishEvent } from "@/lib/events";
import { extractCodeBlocks } from "@/lib/smells/extract-code-blocks";
import { runRulesOnQuestion } from "@/lib/smells/run-rules";
import type { SmellEvidence } from "@/lib/smells/types";
import { shouldTriggerLlmValidation, enqueueLlmSmellValidation } from "@/lib/smells/trigger-llm-validation";

/**
 * Steps 2–6 of the nightly-worker spec. Step 1 (claim the job) and Step 7
 * (mark the event complete) are the dispatcher's job, not this processor's —
 * dispatchEvent() already does markProcessing before calling route(), and
 * markComplete after it returns without throwing. This function only owns
 * the question-document side effects.
 */
export async function processAnalyzeCodeSmells(payload: AnalyzeCodeSmellsPayload): Promise<void> {
  const { questionId, contentHash } = payload;

  const question = await databases.getDocument(db, questionCollection, questionId).catch(() => null);
  if (!question) return; // Step 2 — deleted between enqueue and processing; dispatcher marks the event complete on normal return.

  const content = (question.content as string) ?? "";
  const blocks = extractCodeBlocks(content);

  // Step 3 — no code blocks at all.
  if (blocks.length === 0) {
    await databases.updateDocument(db, questionCollection, questionId, {
      smellAnalysisStatus: "skipped",
      smellAnalysisAt: new Date().toISOString(),
      // Still record the hash — an edit that adds no code blocks either
      // way shouldn't requeue analysis again on the next identical edit.
      smellContentHash: contentHash,
    });
    return;
  }

  // Step 4 — run the rule engine, merged/deduped across all blocks.
  const allDetections: SmellEvidence[] = runRulesOnQuestion(blocks);
  const highConfidence = allDetections.filter((d) => d.confidence === "high");
  const needsLLM = allDetections.filter((d) => d.confidence === "medium" || d.confidence === "low");

  // Step 5 — write high-confidence smells immediately.
  const systemTags = Array.from(new Set(highConfidence.map((d) => d.smell)));
  await databases.updateDocument(db, questionCollection, questionId, {
    systemTags,
    smellEvidence: JSON.stringify(allDetections).slice(0, 500),
    smellContentHash: contentHash,
    smellAnalysisStatus: needsLLM.length > 0 ? "processing" : "complete",
    smellAnalysisAt: new Date().toISOString(),
  });

  // Step 6 — hand medium/low-confidence detections to the Phase 5 LLM pass.
  const title = question.title as string;
  const outcome = {
    needsLLM: needsLLM.map((d) => ({
      smell: d.smell,
      confidence: d.confidence as "medium" | "low",
      triggeredBy: d.triggeredBy,
      lineNumbers: d.lineNumbers,
      snippet: d.snippet,
    })),
    foundNothing: allDetections.length === 0,
  };

  const shouldTrigger = shouldTriggerLlmValidation(outcome, title);

  // Update status based on the final decision, overriding the eager "processing" status above
  // if we decided to skip the LLM after all.
  const finalStatus = shouldTrigger ? "processing" : "complete";
  if (finalStatus !== (needsLLM.length > 0 ? "processing" : "complete")) {
      await databases.updateDocument(db, questionCollection, questionId, {
          smellAnalysisStatus: finalStatus,
      });
  }

  if (shouldTrigger) {
    await enqueueLlmSmellValidation({
      questionId,
      contentHash,
      pendingSmells: outcome.needsLLM,
      titleContext: title,
    });
  }
}
