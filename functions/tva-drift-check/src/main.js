/**
 * Appwrite Function: tva-drift-check
 *
 * Schedule: "0 5 */3 * *"  (every 3 days at 05:00)
 *
 * Compiled entry point deployed to Appwrite Functions. Imports the drift
 * check handler and exposes it as the default export — same pattern as
 * rebuild-tag-expert-registry.
 */

import { driftCheckJobHandler } from "../../../src/lib/tva/drift-check-job";

export default async ({ req, res, log, error }) => {
    log("[tva-drift-check] Function invoked");

    await driftCheckJobHandler({ log, error });

    return res.json({ success: true });
};
