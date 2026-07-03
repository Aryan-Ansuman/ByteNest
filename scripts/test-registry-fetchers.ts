// scripts/test-registry-fetchers.ts
// Run with `npx tsx scripts/test-registry-fetchers.ts`
//
// Exercises the Phase 2 fetcher module against 10 known packages across all
// four ecosystems before it's wired into the nightly job. Writes to
// package_release_cache as a side effect (same as production use) — that's
// intentional, it's exactly what the nightly job will do.
import { fetchPackageLatestRelease } from "@/lib/decay/fetch-package-latest-release";
import type { TechEcosystem } from "@/lib/decay/types";

const TEST_PACKAGES: Array<{ packageName: string; ecosystem: TechEcosystem }> = [
  { packageName: "react", ecosystem: "npm" },
  { packageName: "next", ecosystem: "npm" },
  { packageName: "lodash", ecosystem: "npm" },
  { packageName: "express", ecosystem: "npm" },
  { packageName: "Django", ecosystem: "pypi" },
  { packageName: "Flask", ecosystem: "pypi" },
  { packageName: "tokio", ecosystem: "crates" },
  { packageName: "axum", ecosystem: "crates" },
  { packageName: "golang/go", ecosystem: "github" },
  { packageName: "kubernetes/kubernetes", ecosystem: "github" },
];

async function main() {
  console.log(`Testing ${TEST_PACKAGES.length} packages across 4 ecosystems...\n`);

  let succeeded = 0;
  let failed = 0;

  for (const { packageName, ecosystem } of TEST_PACKAGES) {
    const startedAt = Date.now();
    try {
      const result = await fetchPackageLatestRelease(packageName, ecosystem);
      const durationMs = Date.now() - startedAt;

      if (!result) {
        console.log(`❌ ${ecosystem}:${packageName} — no result and no cache fallback (${durationMs}ms)`);
        failed += 1;
        continue;
      }

      console.log(
        `✅ ${ecosystem}:${packageName} — latest ${result.latestVersion} (major ${result.latestMajorVersion}), ` +
        `released ${result.latestReleaseDate}, ${result.releaseHistory.length} history entries (${durationMs}ms)`
      );
      succeeded += 1;
    } catch (err: any) {
      console.log(`❌ ${ecosystem}:${packageName} — threw unexpectedly: ${err?.message}`);
      failed += 1;
    }
  }

  console.log(`\n${succeeded}/${TEST_PACKAGES.length} succeeded, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main();
