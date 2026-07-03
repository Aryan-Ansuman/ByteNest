import { Query, ID } from "node-appwrite";
import { db, packageReleaseCacheCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { PACKAGE_CACHE_TTL_HOURS } from "./config";
import type { NormalizedRelease } from "./registry-fetchers/types";
import type { TechEcosystem } from "./types";

export type CachedRelease = NormalizedRelease & {
  $id: string;
  lastFetchedAt: string;
};

export async function getCachedRelease(
  packageName: string,
  ecosystem: TechEcosystem
): Promise<CachedRelease | null> {
  const result = await databases.listDocuments(db, packageReleaseCacheCollection, [
    Query.equal("packageName", packageName),
    Query.equal("ecosystem", ecosystem),
    Query.limit(1),
  ]);

  const doc = result.documents[0];
  if (!doc) return null;

  return {
    $id: doc.$id,
    latestVersion: doc.latestVersion as string,
    latestMajorVersion: doc.latestMajorVersion as number,
    latestReleaseDate: doc.latestReleaseDate as string,
    releaseHistory: safeParseHistory(doc.releaseHistory as string | null),
    lastFetchedAt: doc.lastFetchedAt as string,
  };
}

export function isCacheFresh(cached: CachedRelease): boolean {
  const ageMs = Date.now() - new Date(cached.lastFetchedAt).getTime();
  return ageMs < PACKAGE_CACHE_TTL_HOURS * 60 * 60 * 1000;
}

export async function upsertCachedRelease(
  packageName: string,
  ecosystem: TechEcosystem,
  release: NormalizedRelease,
  existingId?: string
): Promise<void> {
  const payload = {
    packageName,
    ecosystem,
    latestVersion: release.latestVersion,
    latestMajorVersion: release.latestMajorVersion,
    latestReleaseDate: release.latestReleaseDate,
    releaseHistory: JSON.stringify(release.releaseHistory).slice(0, 5000),
    lastFetchedAt: new Date().toISOString(),
  };

  if (existingId) {
    await databases.updateDocument(db, packageReleaseCacheCollection, existingId, payload);
  } else {
    await databases.createDocument(db, packageReleaseCacheCollection, ID.unique(), payload);
  }
}

function safeParseHistory(raw: string | null): NormalizedRelease["releaseHistory"] {
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
