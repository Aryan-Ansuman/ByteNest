import { NextRequest, NextResponse } from "next/server";
import { pollPendingEvents, dispatchEvent } from "@/lib/events";

/**
 * Appwrite Function poller endpoint.
 * Called on a schedule (e.g. every 30 seconds via Appwrite Functions cron).
 * Processes up to `batchSize` pending events per invocation.
 *
 * In production, deploy as an Appwrite Function with:
 *   Schedule: "* * * * *" (every minute)
 *   Runtime: node-18.0
 */
export async function POST(req: NextRequest) {
  // Verify internal caller — Appwrite Functions set this header
  const secret = req.headers.get("x-internal-secret");
  if (secret !== process.env.INTERNAL_FUNCTION_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const eventType = searchParams.get("eventType") as Parameters<
    typeof pollPendingEvents
  >[0];
  const batchSize = parseInt(searchParams.get("batchSize") ?? "20", 10);

  const events = await pollPendingEvents(eventType, batchSize);

  const results = await Promise.allSettled(
    events.map((event) => dispatchEvent(event))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({
    processed: events.length,
    succeeded,
    failed,
  });
}
