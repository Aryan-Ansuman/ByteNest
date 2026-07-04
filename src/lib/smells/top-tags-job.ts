/**
 * Code Smell Auto-Tagger — Phase 8.
 * Nightly refresh of the "top 5 most common system tags" cache read by the
 * questions list sidebar. Appwrite has no native group-by, so this tallies
 * client-side over every question with a non-empty systemTags array — same
 * approach as the decay system's drift-check and freshness jobs.
 *
 * appwrite.json wiring:
 * {
 *   "$id": "refresh-top-system-tags",
 *   "name": "Refresh Top System Tags",
 *   "runtime": "node-18.0",
 *   "execute": ["any"],
 *   "events": [],
 *   "schedule": "0 4 * * *",
 *   "timeout": 300,
 *   "entrypoint": "src/main.js",
 *   "commands": "npm install",
 *   "path": "functions/refresh-top-system-tags"
 * }
 */
import { Query, Models } from "node-appwrite";
import { questionCollection } from "@/models/name";
import { listAllDocuments } from "@/lib/appwrite-pagination";
import { setTopSystemTags, type TopSystemTag } from "./top-tags-cache";

const TOP_N = 5;

type QuestionSystemTagsDoc = Models.Document & { systemTags: string[] | null };

export async function topTagsJobHandler({ log, error }: { log: (m: string) => void; error: (m: string) => void }) {
  log("[top-system-tags] Refreshing top system tags cache…");
  try {
    const result = await runTopTagsJob();
    log(`[top-system-tags] Done — top tag: ${result[0]?.smellId ?? "none"} (${result[0]?.count ?? 0}), ${result.length} total`);
  } catch (err: any) {
    error(`[top-system-tags] Job crashed: ${err?.message}`);
    throw err;
  }
}

export async function runTopTagsJob(): Promise<TopSystemTag[]> {
  const { documents } = await listAllDocuments<QuestionSystemTagsDoc>(questionCollection, [
    Query.isNotNull("systemTags"),
    Query.select(["systemTags"]),
  ]);

  const counts = new Map<string, number>();
  for (const doc of documents) {
    for (const tag of doc.systemTags ?? []) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([smellId, count]) => ({ smellId, count }));

  await setTopSystemTags(top);
  return top;
}
