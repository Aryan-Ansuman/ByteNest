import type { TestFramework } from "@/models/name";
import type { ExecutionPlan } from "./types";
import { UnsupportedFrameworkError } from "./types";

/**
 * Concatenates the answer's solutionCode with the question's testCode into
 * the correct file layout for the framework's runner — never regex-extracts
 * code blocks out of markdown, both inputs are already structured fields.
 *
 * Only jest and pytest are implemented. vitest/cargo-test/go-test require
 * project-structured execution (package.json + node_modules, or a Cargo/Go
 * module) that a single-file Piston call can't represent — left as an
 * explicit unsupported error rather than silently mis-running them.
 */
export function buildExecutionPlan(
  framework: TestFramework,
  solutionCode: string,
  testCode: string
): ExecutionPlan {
  switch (framework) {
    case "jest":
      return buildJestPlan(solutionCode, testCode);
    case "pytest":
      return buildPytestPlan(solutionCode, testCode);
    case "vitest":
    case "cargo-test":
    case "go-test":
      throw new UnsupportedFrameworkError(framework);
    default: {
      const _exhaustive: never = framework;
      throw new UnsupportedFrameworkError(_exhaustive);
    }
  }
}

function buildJestPlan(solutionCode: string, testCode: string): ExecutionPlan {
  // solution.js is a plain module; the question's test file imports it via
  // `require("./solution")`. The runner invokes jest's programmatic API
  // directly — jest.run() sets process.exitCode based on pass/fail, which
  // is exactly the contract Phase 0 standardized on (exit 0 = pass).
  const runner = `
const jest = require("jest");
jest.run(["--ci", "--colors=false", "--rootDir=.", "solution.test.js"]);
`.trim();

  return {
    language: "javascript",
    version: "*",
    files: [
      { name: "solution.js", content: solutionCode },
      { name: "solution.test.js", content: testCode },
      { name: "runner.js", content: runner },
    ],
  };
}

function buildPytestPlan(solutionCode: string, testCode: string): ExecutionPlan {
  // Same shape as jest: solution as an importable module, test file imports
  // it, and a small runner invokes pytest.main() programmatically so the
  // process exit code reflects pytest's own pass/fail determination.
  const runner = `
import sys
import pytest

sys.exit(pytest.main(["-q", "test_solution.py"]))
`.trim();

  return {
    language: "python",
    version: "*",
    files: [
      { name: "solution.py", content: solutionCode },
      { name: "test_solution.py", content: testCode },
      { name: "runner.py", content: runner },
    ],
  };
}
