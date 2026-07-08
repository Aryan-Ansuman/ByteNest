import { webhookSecretRotationHandler } from "@/lib/github/webhook-secret-rotation-job";

async function main() {
  const summary = await webhookSecretRotationHandler({
    log: (msg) => console.log(msg),
    error: (msg) => console.error(msg),
  });
  console.log(JSON.stringify(summary, null, 2));
}

main();
