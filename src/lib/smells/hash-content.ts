import { createHash } from "crypto";

/** SHA-256 hex digest — Decision 5's edit-guard, and the dedup key input for AnalyzeCodeSmells. */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
