import type { TestFramework } from "@/models/name";

// Used only by the dry-run endpoint — lets a question author validate their
// test file parses and executes before any real answer exists. Calling into
// an empty module will throw at runtime (undefined is not a function /
// ImportError), which is expected and reported separately from a genuine
// syntax error in the dry-run classifier.
export const PLACEHOLDER_SOLUTIONS: Partial<Record<TestFramework, string>> = {
  jest: "module.exports = {};\n",
  pytest: "# No solution submitted yet — dry run only validates the test file itself.\n",
};
