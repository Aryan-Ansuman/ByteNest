import { topTagsJobHandler } from "../../../src/lib/smells/top-tags-job";

export default async ({ req, res, log, error }) => {
    log("[refresh-top-system-tags] Function invoked");
    await topTagsJobHandler({ log, error });
    return res.json({ success: true });
};
