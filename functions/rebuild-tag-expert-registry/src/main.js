/**
 * Appwrite Function: rebuild-tag-expert-registry
 *
 * Schedule: "0 * * * *"  (every hour)
 *
 * This is the compiled entry point deployed to Appwrite Functions.
 * It imports the registry rebuild handler and exposes it as the default export.
 */

import { Client, Databases, Users } from "node-appwrite";
import { registryRebuildJobHandler } from "../../../src/lib/skills/registry-rebuild-job";

export default async ({ req, res, log, error }) => {
    log("[rebuild-tag-expert-registry] Function invoked");

    // The handler does all the work — it expects { log, error } callbacks
    await registryRebuildJobHandler({ log, error });

    return res.json({ success: true });
};
