/**
 * Appwrite Function: recompute-answer-freshness
 *
 * Schedule: "0 2 * * *"  (02:00 UTC nightly — after the hourly
 * rebuild-tag-expert-registry run, deliberately off the top of the hour)
 *
 * Compiled entry point deployed to Appwrite Functions. Imports the
 * freshness job handler and exposes it as the default export — same
 * pattern as rebuild-tag-expert-registry.
 */

import { freshnessJobHandler } from "../../../src/lib/decay/nightly-job";

export default async ({ req, res, log, error }) => {
    log("[recompute-answer-freshness] Function invoked");

    await freshnessJobHandler({ log, error });

    return res.json({ success: true });
};
