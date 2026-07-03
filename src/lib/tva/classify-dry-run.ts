export type DryRunClassification = {
  ok: boolean; // false only for a genuine syntax/parse error
  message: string;
};

/**
 * Distinguishes "your test file has a syntax error" from "your test file
 * runs fine but obviously fails because there's no real solution yet" —
 * the latter is the expected, healthy outcome of a dry run.
 */
export function classifyDryRun(stdout: string, stderr: string): DryRunClassification {
  const combined = `${stdout}\n${stderr}`;

  // "SyntaxError" is the shared keyword across Node and Python tracebacks —
  // both runtimes use this exact term for parse failures.
  if (/SyntaxError/.test(combined)) {
    const line = combined.split("\n").find((l) => l.includes("SyntaxError"));
    return {
      ok: false,
      message: line ? `Syntax error in test file: ${line.trim()}` : "Syntax error in test file",
    };
  }

  return {
    ok: true,
    message: "Test suite parses and runs. Failures shown are expected — there's no real solution yet, this just confirms the test file itself is valid.",
  };
}
