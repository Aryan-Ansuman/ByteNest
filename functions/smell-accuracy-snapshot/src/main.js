/**
 * Appwrite Function: smell-accuracy-snapshot
 * Schedule: "0 3 * * *" (03:00 UTC nightly)
 */
import { accuracyJobHandler } from "../../../src/lib/smells/accuracy-job";

export default async ({ req, res, log, error }) => {
    log("[smell-accuracy-snapshot] Function invoked");
    await accuracyJobHandler({ log, error });
    return res.json({ success: true });
};
