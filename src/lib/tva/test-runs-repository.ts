import { ID } from "node-appwrite";
import { db, testRunsCollection } from "@/models/name";
import { databases } from "@/models/server/config";

export async function createPendingTestRun(
  answerId: string,
  questionId: string,
  triggeredBy: string
): Promise<string> {
  const doc = await databases.createDocument(db, testRunsCollection, ID.unique(), {
    answerId,
    questionId,
    triggeredBy,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  return doc.$id;
}

export async function markTestRunProcessing(testRunId: string): Promise<void> {
  await databases.updateDocument(db, testRunsCollection, testRunId, {
    status: "processing",
  });
}

export async function completeTestRun(
  testRunId: string,
  result: {
    stdout: string;
    stderr: string;
    exitCode: number;
    durationMs: number;
    pistonRuntime: string;
  }
): Promise<void> {
  await databases.updateDocument(db, testRunsCollection, testRunId, {
    status: "complete",
    stdout: result.stdout.slice(0, 20_000),
    stderr: result.stderr.slice(0, 20_000),
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    pistonRuntime: result.pistonRuntime,
    completedAt: new Date().toISOString(),
  });
}

// Used both for "Piston itself errored, will retry" and "retries exhausted,
// giving up" — the distinction lives in the answer's verificationStatus
// (stays "pending" mid-retry, becomes "error" once exhausted), not here.
export async function failTestRun(testRunId: string, stderr: string): Promise<void> {
  await databases.updateDocument(db, testRunsCollection, testRunId, {
    status: "failed",
    stderr: stderr.slice(0, 20_000),
    completedAt: new Date().toISOString(),
  });
}
