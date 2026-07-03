import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth";
import { databases } from "@/models/server/config";
import { db, roomMembersCollection } from "@/models/name";
import { Query } from "node-appwrite";

// Supported runtimes on Wandbox (https://wandbox.org) — free, no key
const LANG_TO_WANDBOX: Record<string, string> = {
    javascript: "nodejs-20.17.0",
    typescript: "typescript-5.6.2",
    python:     "cpython-head",
    rust:       "rust-1.82.0",
    go:         "go-1.23.2",
};

export async function POST(
    req: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await getAuthenticatedUserId();
        const { id: roomId } = params;

        // Verify membership
        const memberQuery = await databases.listDocuments(db, roomMembersCollection, [
            Query.equal("roomId", roomId),
            Query.equal("userId", userId),
            Query.limit(1),
        ]);
        if (memberQuery.total === 0) {
            return NextResponse.json({ error: "Not a member" }, { status: 403 });
        }

        const { code, language } = await req.json();

        if (!code?.trim()) {
            return NextResponse.json({ error: "No code to run" }, { status: 400 });
        }

        const compiler = LANG_TO_WANDBOX[language];
        if (!compiler) {
            return NextResponse.json(
                { error: `"${language}" is not supported for execution. Supported: ${Object.keys(LANG_TO_WANDBOX).join(", ")}` },
                { status: 400 }
            );
        }

        const start = Date.now();

        const wandboxRes = await fetch("https://wandbox.org/api/compile.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                compiler,
                code: code,
                save: false
            }),
            signal: AbortSignal.timeout(20000),
        });

        const durationMs = Date.now() - start;

        if (!wandboxRes.ok) {
            const errText = await wandboxRes.text().catch(() => "");
            return NextResponse.json(
                { error: `Execution service error: ${wandboxRes.status} ${errText}` },
                { status: 502 }
            );
        }

        const wandbox = await wandboxRes.json();
        
        let stdout = wandbox.program_message ?? "";
        let stderr = wandbox.program_error ?? "";
        if (wandbox.compiler_error) {
            stderr = wandbox.compiler_error + "\n" + stderr;
        }

        return NextResponse.json({
            stdout,
            stderr: stderr.trim(),
            exitCode: parseInt(wandbox.status ?? "0", 10),
            language,
            durationMs,
            runAt: new Date().toISOString(),
        });
    } catch (error: any) {
        if (error instanceof Response) return error;
        if (error?.name === "TimeoutError") {
            return NextResponse.json({ error: "Execution timed out (20s)" }, { status: 504 });
        }
        return NextResponse.json({ error: error?.message || "Execution error" }, { status: 500 });
    }
}
