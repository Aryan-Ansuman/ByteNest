import { webhookDeregistrationSweepHandler } from "@/lib/github/webhook-deregistration-job";

async function main() {
  const summary = await webhookDeregistrationSweepHandler({
    log: (msg) => console.log(msg),
    error: (msg) => console.error(msg),
  });
  console.log(JSON.stringify(summary, null, 2));
}

main();
