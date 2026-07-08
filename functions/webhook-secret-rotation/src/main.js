/**
 * Appwrite Function: webhook-secret-rotation
 *
 * Schedule: "0 4 1 * *"  (04:00 UTC on the 1st of every month)
 *
 * Compiled entry point deployed to Appwrite Functions. Imports the
 * rotation handler and exposes it as the default export — same pattern as
 * recompute-answer-freshness.
 */

import { webhookSecretRotationHandler } from "../../../src/lib/github/webhook-secret-rotation-job";

export default async ({ req, res, log, error }) => {
    log("[webhook-secret-rotation] Function invoked");

    const result = await webhookSecretRotationHandler({ log, error });

    return res.json({ success: true, ...result });
};
