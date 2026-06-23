import { NextRequest, NextResponse } from "next/server";
import { runNightlyMerge } from "@/lib/similarity/scalability/ann/mergeJob";

/**
 * Trigger endpoint for the nightly ANN merge job.
 * Called by a scheduled Appwrite Function at 03:00 UTC.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_FUNCTION_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await runNightlyMerge();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ann/merge]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
