// Backoff schedule: 30s, 2m, 8m, 32m, then permanently fail
const BACKOFF_MS = [
  30_000,        //  30 seconds
  120_000,       //   2 minutes
  480_000,       //   8 minutes
  1_920_000,     //  32 minutes
];
const MAX_RETRIES = 5;

export async function handleEmbeddingFailure(doc, err, log, res, databases, enqueueEvent) {
  const newRetryCount = (doc.retryCount ?? 0) + 1;

  if (newRetryCount > MAX_RETRIES) {
    // Permanently failed — exclude from search, keep question accessible
    await databases.updateDocument(
      process.env.APPWRITE_DATABASE_ID,
      'question_embeddings',
      doc.$id,
      {
        embeddingStatus: 'permanently_failed',
        retryCount:      newRetryCount,
        failureReason:   err.message,
        nextRetryAt:     null,
      }
    );

    log(`PERMANENTLY FAILED: ${doc.questionId} after ${newRetryCount} attempts`);
    return res.json({ status: 'permanently_failed', questionId: doc.questionId });
  }

  const delayMs    = BACKOFF_MS[newRetryCount - 1] ?? BACKOFF_MS.at(-1);
  const nextRetry  = new Date(Date.now() + delayMs).toISOString();

  await databases.updateDocument(
    process.env.APPWRITE_DATABASE_ID,
    'question_embeddings',
    doc.$id,
    {
      embeddingStatus: 'failed',
      retryCount:      newRetryCount,
      failureReason:   err.message,
      nextRetryAt:     nextRetry,
    }
  );

  // Re-queue with delay
  await enqueueEvent('EmbeddingRequested', {
    questionId:    doc.questionId,
    scheduleAfter: nextRetry,
    priority:      'retry',
  });

  log(`Retry ${newRetryCount}/${MAX_RETRIES} for ${doc.questionId} at ${nextRetry}`);
  return res.json({ status: 'failed', retryCount: newRetryCount, nextRetry });
}
