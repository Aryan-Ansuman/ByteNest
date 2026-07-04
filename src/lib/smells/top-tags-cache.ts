import { db, systemConfigCollection } from "@/models/name";
import { databases } from "@/models/server/config";

const TOP_TAGS_DOC_ID = "top_system_tags";

export type TopSystemTag = { smellId: string; count: number };

export async function getTopSystemTags(): Promise<TopSystemTag[]> {
  try {
    const doc = await databases.getDocument(db, systemConfigCollection, TOP_TAGS_DOC_ID);
    return JSON.parse((doc.data as string) ?? "[]");
  } catch (err: any) {
    if (err.code === 404) return []; // not seeded yet — sidebar section just doesn't render
    throw err;
  }
}

export async function setTopSystemTags(tags: TopSystemTag[]): Promise<void> {
  const payload = { data: JSON.stringify(tags).slice(0, 2000), updatedAt: new Date().toISOString() };
  try {
    await databases.updateDocument(db, systemConfigCollection, TOP_TAGS_DOC_ID, payload);
  } catch (err: any) {
    if (err.code === 404) {
      await databases.createDocument(db, systemConfigCollection, TOP_TAGS_DOC_ID, payload);
      return;
    }
    throw err;
  }
}
