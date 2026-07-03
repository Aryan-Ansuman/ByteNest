import type { TestFramework } from "@/models/name";

/**
 * Parses the test runner's summary line for a pass percentage. Falls back to
 * binary pass/fail (100 or 0) based on exit code if parsing fails — summary
 * line formats are stable but not a contract worth trusting blindly.
 */
export function parseVerificationScore(
  framework: TestFramework,
  stdout: string,
  exitCode: number
): number {
  const parsed = framework === "jest"
    ? parseJestSummary(stdout)
    : framework === "pytest"
    ? parsePytestSummary(stdout)
    : null;

  if (parsed !== null) return parsed;
  return exitCode === 0 ? 100 : 0;
}

function parseJestSummary(stdout: string): number | null {
  // "Tests:       3 passed, 1 failed, 4 total"
  const match = stdout.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(?:(\d+)\s+passed,\s+)?(\d+)\s+total/);
  if (!match) {
    // Handle "Tests: X passed, Y total" (no failures) ordering too.
    const passedOnly = stdout.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
    if (!passedOnly) return null;
    const [, passed, total] = passedOnly;
    return scoreFrom(Number(passed), Number(total));
  }
  const [, , passed, total] = match;
  if (passed === undefined) return null;
  return scoreFrom(Number(passed), Number(total));
}

function parsePytestSummary(stdout: string): number | null {
  // "2 passed, 1 failed in 0.12s" or "3 passed in 0.05s"
  const passedMatch = stdout.match(/(\d+)\s+passed/);
  if (!passedMatch) return null;
  const failedMatch = stdout.match(/(\d+)\s+failed/);
  const passed = Number(passedMatch[1]);
  const failed = failedMatch ? Number(failedMatch[1]) : 0;
  return scoreFrom(passed, passed + failed);
}

function scoreFrom(passed: number, total: number): number | null {
  if (!Number.isFinite(passed) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((passed / total) * 100);
}
