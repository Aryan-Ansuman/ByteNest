/**
 * Appwrite Function: webhook-deregistration-sweep
 *
 * Schedule: "30 2 * * *"  (02:30 UTC nightly — between
 * recompute-answer-freshness at 02:00 and embedding-monitor at 08:00)
 *
 * Compiled entry point deployed to Appwrite Functions. Imports the sweep
 * handler and exposes it as the default export — same pattern as
 * recompute-answer-freshness.
 */

import { webhookDeregistrationSweepHandler } from "../../../src/lib/github/webhook-deregistration-job";

export default async ({ req, res, log, error }) => {
    log("[webhook-deregistration-sweep] Function invoked");

    const result = await webhookDeregistrationSweepHandler({ log, error });

    return res.json({ success: true, ...result });
};
