import { runAccuracyJob } from "@/lib/smells/accuracy-job";

async function main() {
  const summary = await runAccuracyJob();
  console.log(JSON.stringify(summary, null, 2));
}

main();
