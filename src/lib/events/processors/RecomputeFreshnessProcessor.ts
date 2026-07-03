import type { RecomputeFreshnessPayload } from "../types";
import { recomputeAnswerFreshness } from "@/lib/decay/recompute-single-answer";

/**
 * RecomputeFreshness processor — event-driven counterpart to the nightly
 * batch job (Phase 3). Fired by a staleness vote being cast or retracted so
 * the score reflects the change within seconds rather than waiting for the
 * next 02:00 UTC run.
 */
export async function processRecomputeFreshness(payload: RecomputeFreshnessPayload): Promise<void> {
  await recomputeAnswerFreshness(payload.answerId);
}
