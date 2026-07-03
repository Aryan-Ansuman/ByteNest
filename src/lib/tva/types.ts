import type { TestFramework } from "@/models/name";

export class PistonExecutionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "PistonExecutionError";
  }
}

export class UnsupportedFrameworkError extends Error {
  constructor(framework: string) {
    super(`TVA execution is not yet implemented for framework: ${framework}`);
    this.name = "UnsupportedFrameworkError";
  }
}

export type ExecutionFile = { name: string; content: string };

export type ExecutionPlan = {
  language: string;   // Piston language identifier
  version: string;    // Piston version selector ("*" = latest available)
  files: ExecutionFile[];
};

export type PistonExecuteResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  runtime: string; // "<language>:<version>" as reported by Piston
};

export type SupportedFramework = Extract<
  TestFramework,
  "jest" | "pytest"
>;
