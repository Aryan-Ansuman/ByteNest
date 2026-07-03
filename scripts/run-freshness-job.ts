// scripts/run-freshness-job.ts
// Run with `npx tsx scripts/run-freshness-job.ts`
import { runFreshnessJob } from "@/lib/decay/nightly-job";

async function main() {
  console.log("Running freshness job manually...\n");
  const summary = await runFreshnessJob({
    onStep: (msg) => console.log(msg),
    onAnswerError: (answerId, err: any) => console.error(`  ✗ ${answerId}: ${err?.message}`),
  });

  console.log("\n── Summary ──");
  console.log(JSON.stringify(summary, null, 2));
}

main();
