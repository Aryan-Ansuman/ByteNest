import { Query } from "node-appwrite";
import { db } from "@/models/name";
import { databases } from "@/models/server/config";

const PAGE_SIZE = 100;

export async function listAllDocuments<TDocument extends { $id: string }>(
    collectionId: string,
    queries: string[] = [],
    pageSize = PAGE_SIZE
) {
    const documents: TDocument[] = [];
    let cursor: string | null = null;

    for (;;) {
        const page = await databases.listDocuments<TDocument>(db, collectionId, [
            ...queries,
            Query.limit(pageSize),
            ...(cursor ? [Query.cursorAfter(cursor)] : []),
        ]);

        documents.push(...page.documents);

        if (page.documents.length < pageSize || documents.length >= page.total) {
            return { total: page.total, documents };
        }

        cursor = page.documents[page.documents.length - 1].$id;
    }
}
