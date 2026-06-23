import { ANNIndexManager } from "./annIndexManager";
import type { ANNIndexMeta } from "../types";

/**
 * Step 7.4 — Nightly secondary → primary merge job.
 * Called by a scheduled Appwrite Function during low-traffic hours (e.g. 03:00 UTC).
 *
 * The actual merge operation (FAISS index rebuild or merge_from()) runs on the
 * Python sidecar — this job triggers it via HTTP and updates the metadata record.
 */
export async function runNightlyMerge(): Promise<void> {
  const manager = new ANNIndexManager("tier2_1m");
  const ANN_SIDECAR_URL = process.env.ANN_SIDECAR_URL ?? "";

  const secondaryMeta = await manager.getIndexMeta("secondary");
  if (!secondaryMeta || secondaryMeta.vectorCount === 0) {
    console.log("[annMerge] secondary index empty — skipping merge");
    return;
  }

  // Trigger merge on sidecar
  const res = await fetch(`${ANN_SIDECAR_URL}/merge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "secondary", target: "primary" }),
  });

  if (!res.ok) {
    throw new Error(`ANN merge failed: ${res.status} ${await res.text()}`);
  }

  const now = new Date().toISOString();

  // Update primary metadata
  const primaryMeta = await manager.getIndexMeta("primary");
  await manager.upsertIndexMeta({
    indexId: "primary",
    indexType: "primary",
    shardTag: null,
    vectorCount: (primaryMeta?.vectorCount ?? 0) + secondaryMeta.vectorCount,
    dimensions: secondaryMeta.dimensions,
    lastBuiltAt: primaryMeta?.lastBuiltAt ?? now,
    lastMergedAt: now,
    embeddingModel: secondaryMeta.embeddingModel,
    embeddingVersion: secondaryMeta.embeddingVersion,
  });

  // Reset secondary metadata
  await manager.upsertIndexMeta({
    indexId: "secondary",
    indexType: "secondary",
    shardTag: null,
    vectorCount: 0,
    dimensions: secondaryMeta.dimensions,
    lastBuiltAt: now,
    lastMergedAt: now,
    embeddingModel: secondaryMeta.embeddingModel,
    embeddingVersion: secondaryMeta.embeddingVersion,
  });

  console.log(
    `[annMerge] merged ${secondaryMeta.vectorCount} vectors into primary`
  );
}
