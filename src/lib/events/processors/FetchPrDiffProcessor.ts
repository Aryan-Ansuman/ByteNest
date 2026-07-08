import { InputFile } from "node-appwrite/file";
import { Query } from "node-appwrite";
import type { FetchPrDiffPayload } from "../types";
import { db, questionAttachmentBucket, prQuestionMetadataCollection, questionCollection } from "@/models/name";
import { databases, storage } from "@/models/server/config";
import { fetchPrDiff } from "@/lib/github";
import { ensureWebhookRegistered } from "@/lib/github/webhook-registration";

/**
 * Shared by FetchPrDiff (Phase 3, initial fetch on question creation) and
 * RefreshPrDiff (Phase 4, re-fetch on the "synchronize" webhook action) —
 * both do the exact same fetch-and-overwrite; only the caller differs.
 */
export async function fetchAndStorePrDiff(payload: FetchPrDiffPayload): Promise<void> {
    const { questionId, owner, repoName, prNumber } = payload;

    const question = await databases.getDocument(db, questionCollection, questionId).catch(() => null);
    if (!question) return; // Deleted between enqueue and processing.

    const metadataDocs = await databases.listDocuments(db, prQuestionMetadataCollection, [
        Query.equal("questionId", questionId),
        Query.limit(1)
    ]);
    if (metadataDocs.total === 0) return;
    const metadataDocId = metadataDocs.documents[0].$id;

    const diffText = await fetchPrDiff(owner, repoName, prNumber);

    // File name convention: {questionId}.diff — same ID is reused so a
    // refresh (Phase 8's "synchronize" webhook) overwrites in place.
    const fileId = questionId;
    await storage
        .deleteFile(questionAttachmentBucket, fileId)
        .catch(() => undefined); // no-op if this is the first fetch

    const file = await storage.createFile(
        questionAttachmentBucket,
        fileId,
        InputFile.fromBuffer(Buffer.from(diffText, "utf8"), `${questionId}.diff`)
    );

    await databases.updateDocument(db, prQuestionMetadataCollection, metadataDocId, {
        diffFileId: file.$id,
        diffFetchedAt: new Date().toISOString(),
    });
}

/**
 * PR-Linked Q&A — Phase 3's fire-and-forget diff fetch. Runs out of band
 * from question creation: the question already exists with diffFileId: null,
 * and the UI (Phase 5) polls/refetches until this fills it in.
 *
 * Phase 7: also the trigger point for webhook registration — per spec,
 * it happens in this same background job, not a separate event. Isolated
 * in its own try/catch so a GitHub registration hiccup never undoes an
 * otherwise-successful diff fetch.
 */
export async function processFetchPrDiff(payload: FetchPrDiffPayload): Promise<void> {
    await fetchAndStorePrDiff(payload);

    try {
        await ensureWebhookRegistered(payload.owner, payload.repoName);
    } catch (err) {
        console.error(`[FetchPrDiffProcessor] Webhook registration failed for ${payload.owner}/${payload.repoName}:`, err);
    }
}
