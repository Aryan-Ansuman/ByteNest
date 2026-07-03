import { IndexType, Permission } from "node-appwrite";
import { db, packageReleaseCacheCollection } from "../name";
import { databases } from "./config";

// Caches external registry lookups (npm/PyPI/crates.io/GitHub) so the
// nightly job never hits an external API per-answer — only per unique
// (packageName, ecosystem) pair, with a 23h TTL enforced at read time by
// the Phase 2 fetcher module, not by Appwrite itself.
export default async function createPackageReleaseCacheCollection() {
    await databases.createCollection(db, packageReleaseCacheCollection, packageReleaseCacheCollection, [
        Permission.read("any"),
        // Only the nightly job (server) creates/updates these documents,
        // so we don't grant create/update/delete to "users".
    ]);
    console.log("Package Release Cache collection created");

    const attributes = await Promise.all([
        databases.createStringAttribute(db, packageReleaseCacheCollection, "packageName", 100, true),
        databases.createEnumAttribute(db, packageReleaseCacheCollection, "ecosystem", ["npm", "pypi", "crates", "github"], true),
        databases.createStringAttribute(db, packageReleaseCacheCollection, "latestVersion", 30, false),
        databases.createIntegerAttribute(db, packageReleaseCacheCollection, "latestMajorVersion", false, undefined, undefined, undefined),
        databases.createDatetimeAttribute(db, packageReleaseCacheCollection, "latestReleaseDate", false),
        // JSON string — an array of the last 10 releases with version and date
        databases.createStringAttribute(db, packageReleaseCacheCollection, "releaseHistory", 10000, false),
        databases.createDatetimeAttribute(db, packageReleaseCacheCollection, "lastFetchedAt", true),
    ]);
    console.log("Package Release Cache Attributes created");

    await Promise.all(
        attributes.map(async (attribute: any) => {
            for (let attempt = 0; attempt < 60; attempt++) {
                const current: any = await databases.getAttribute(db, packageReleaseCacheCollection, attribute.key);
                if (current.status === "available") return;
                if (current.status === "failed") {
                    throw new Error(`Package Release Cache attribute ${attribute.key} failed to initialize`);
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error(`Timed out waiting for package release cache attribute ${attribute.key}`);
        })
    );

    await Promise.all([
        databases.createIndex(
            db,
            packageReleaseCacheCollection,
            "package_ecosystem_unique",
            IndexType.Unique,
            ["packageName", "ecosystem"]
        ),
    ]);
    console.log("Package Release Cache indexes created");
}
