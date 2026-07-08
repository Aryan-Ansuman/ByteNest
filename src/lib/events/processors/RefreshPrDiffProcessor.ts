import { InputFile } from "node-appwrite/file";
import { db, questionCollection, prQuestionMetadataCollection, prDiffsBucket } from "@/models/name";
import { Query } from "node-appwrite";
import { databases, storage } from "@/models/server/config";
import { fetchPrDiff } from "@/lib/github";
import { postPrSystemComment } from "@/lib/pr-questions/systemComment";
import { revalidateQuestionCaches } from "@/lib/cache-invalidation";
import type { RefreshPrDiffPayload } from "../types";

/**
 * RefreshPrDiff processor — fired when the Phase 4 webhook receives a
 * `pull_request` event with `action: "synchronize"` (new commits pushed to
 * an open PR). Re-fetches the unified diff and overwrites the existing
 * Storage file at the question's `diffFileId`, keeping the file ID stable
 * so nothing else on the question document needs to change.
 *
 * Does NOT touch existing line-anchored answers — `diffLineContext` (stored
 * per-answer) is what keeps them meaningful after this runs. The UI is
 * responsible for detecting orphaned anchors against the refreshed diff
 * (see lib/pr-questions/diffOrphan.ts).
 */
export async function processRefreshPrDiff(payload: RefreshPrDiffPayload): Promise<void> {
    const { questionId, owner, repoName, prNumber } = payload;

    const question = await databases.getDocument(db, questionCollection, questionId).catch(() => null);
    if (!question) return; // question deleted since the event was queued — nothing to refresh

    const metadataQuery = await databases.listDocuments(db, prQuestionMetadataCollection, [
        Query.equal("questionId", questionId),
        Query.limit(1)
    ]);
    if (metadataQuery.total === 0) return;
    const metadataDoc = metadataQuery.documents[0];

    const diffText = await fetchPrDiff(owner, repoName, prNumber);
    const existingFileId = metadataDoc.diffFileId as string | null;

    // Appwrite Storage has no in-place overwrite — delete then recreate at
    // the same file ID so `question.diffFileId` never has to change.
    if (existingFileId) {
        await storage.deleteFile(prDiffsBucket, existingFileId).catch(() => undefined);
    }

    const fileId = existingFileId ?? questionId;
    await storage.createFile(
        prDiffsBucket,
        fileId,
        InputFile.fromBuffer(Buffer.from(diffText, "utf-8"), `${questionId}.diff`)
    );

    const now = new Date().toISOString();
    await Promise.all([
        databases.updateDocument(db, prQuestionMetadataCollection, metadataDoc.$id, {
            diffFileId: fileId,
            diffFetchedAt: now,
        }),
        databases.updateDocument(db, questionCollection, questionId, {
            activityAt: now,
        }).catch(() => undefined),
    ]);

    await postPrSystemComment(
        questionId,
        "The PR was updated with new commits — diff has been refreshed."
    );

    await revalidateQuestionCaches(questionId, [question.title]).catch(() => {});
}
