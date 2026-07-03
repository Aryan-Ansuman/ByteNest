import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { buildExecutionPlan } from "@/lib/tva/build-execution-plan";
import { executePiston } from "@/lib/tva/piston-client";
import { classifyDryRun } from "@/lib/tva/classify-dry-run";
import { PLACEHOLDER_SOLUTIONS } from "@/lib/tva/placeholder-solutions";
import { UnsupportedFrameworkError, PistonExecutionError } from "@/lib/tva/types";
import type { TestFramework } from "@/models/name";

// Dry runs cost real Piston quota per click — looser than answer/question
// posting limits (this is pre-publish iteration, expected to be called
// repeatedly while a question author is fixing their test file) but still
// capped per the Phase 0 trust-boundary requirement.
const DRYRUN_RATE_LIMIT = 20;
const DRYRUN_WINDOW_MS = 10 * 60_000;

export async function POST(request: NextRequest) {
    try {
        const userId = await getAuthenticatedUserId();

        const rl = await rateLimit({
            key: `test-dryrun:${userId}`,
            limit: DRYRUN_RATE_LIMIT,
            windowMs: DRYRUN_WINDOW_MS,
        });
        const rlHeaders = rateLimitHeaders(rl, DRYRUN_RATE_LIMIT);

        if (!rl.success) {
            return NextResponse.json(
                { error: "Too many dry runs. Please slow down." },
                { status: 429, headers: rlHeaders }
            );
        }

        const { testCode, testFramework } = (await request.json()) as {
            testCode?: string;
            testFramework?: TestFramework;
        };

        if (!testCode || testCode.trim().length === 0) {
            return NextResponse.json({ error: "testCode is required" }, { status: 400, headers: rlHeaders });
        }
        if (!testFramework) {
            return NextResponse.json({ error: "testFramework is required" }, { status: 400, headers: rlHeaders });
        }

        const placeholderSolution = PLACEHOLDER_SOLUTIONS[testFramework];
        if (!placeholderSolution) {
            return NextResponse.json(
                { error: `Dry run isn't available yet for ${testFramework} — your test suite will still be saved when you post.` },
                { status: 400, headers: rlHeaders }
            );
        }

        let plan;
        try {
            plan = buildExecutionPlan(testFramework, placeholderSolution, testCode);
        } catch (err) {
            if (err instanceof UnsupportedFrameworkError) {
                return NextResponse.json({ error: err.message }, { status: 400, headers: rlHeaders });
            }
            throw err;
        }

        const result = await executePiston(plan);
        const classification = classifyDryRun(result.stdout, result.stderr);

        return NextResponse.json(
            {
                ok: classification.ok,
                message: classification.message,
                stdout: result.stdout.slice(0, 4_000),
                stderr: result.stderr.slice(0, 4_000),
            },
            { status: 200, headers: rlHeaders }
        );
    } catch (error: unknown) {
        if (error instanceof Response) return error;
        if (error instanceof PistonExecutionError) {
            return NextResponse.json(
                { error: "Sandbox executor is unavailable right now. Try again in a moment." },
                { status: 503 }
            );
        }
        const e = error as any;
        return NextResponse.json(
            { error: e?.message || "Dry run failed" },
            { status: e?.status || e?.code || 500 }
        );
    }
}
