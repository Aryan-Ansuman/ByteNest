"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Loader2, CheckCircle2, XCircle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";
import type { TestFramework } from "@/models/name";

// Monaco must not run on server — same pattern as rooms/CodePanel.
const Editor = dynamic(() => import("@monaco-editor/react"), {
    ssr: false,
    loading: () => (
        <div className="flex h-64 items-center justify-center bg-[#1A1A20] text-zinc-600 text-sm rounded-xl">
            Loading editor…
        </div>
    ),
});

type FrameworkOption = {
    framework: TestFramework;
    label: string;
    languages: { id: string; label: string; monaco: string }[];
    dryRunSupported: boolean;
};

const FRAMEWORK_OPTIONS: FrameworkOption[] = [
    {
        framework: "jest",
        label: "Jest",
        languages: [
            { id: "javascript", label: "JavaScript", monaco: "javascript" },
            { id: "typescript", label: "TypeScript", monaco: "typescript" },
        ],
        dryRunSupported: true,
    },
    {
        framework: "pytest",
        label: "pytest",
        languages: [{ id: "python", label: "Python", monaco: "python" }],
        dryRunSupported: true,
    },
    {
        framework: "vitest",
        label: "Vitest",
        languages: [{ id: "javascript", label: "JavaScript", monaco: "javascript" }],
        dryRunSupported: false,
    },
    {
        framework: "cargo-test",
        label: "cargo test",
        languages: [{ id: "rust", label: "Rust", monaco: "rust" }],
        dryRunSupported: false,
    },
    {
        framework: "go-test",
        label: "go test",
        languages: [{ id: "go", label: "Go", monaco: "go" }],
        dryRunSupported: false,
    },
];

const TEST_CODE_PLACEHOLDER: Partial<Record<TestFramework, string>> = {
    jest: `const solution = require("./solution");\n\ntest("describe what this checks", () => {\n  expect(solution.yourFunction(/* args */)).toBe(/* expected */);\n});\n`,
    pytest: `from solution import your_function\n\ndef test_describe_what_this_checks():\n    assert your_function(/* args */) == /* expected */\n`,
};

interface Props {
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
    framework: TestFramework | "";
    onFrameworkChange: (framework: TestFramework) => void;
    language: string;
    onLanguageChange: (language: string) => void;
    testCode: string;
    onTestCodeChange: (code: string) => void;
}

export default function TestSuiteEditor({
    enabled,
    onEnabledChange,
    framework,
    onFrameworkChange,
    language,
    onLanguageChange,
    testCode,
    onTestCodeChange,
}: Props) {
    const [dryRunState, setDryRunState] = useState<"idle" | "running" | "ok" | "error">("idle");
    const [dryRunMessage, setDryRunMessage] = useState("");

    const selectedFramework = FRAMEWORK_OPTIONS.find((f) => f.framework === framework);
    const monacoLanguage =
        selectedFramework?.languages.find((l) => l.id === language)?.monaco ??
        selectedFramework?.languages[0]?.monaco ??
        "javascript";

    function selectFramework(opt: FrameworkOption) {
        onFrameworkChange(opt.framework);
        onLanguageChange(opt.languages[0].id);
        setDryRunState("idle");
        setDryRunMessage("");
    }

    async function runDryRun() {
        if (!selectedFramework || !testCode.trim()) return;
        setDryRunState("running");
        setDryRunMessage("");
        try {
            const res = await apiFetch("/api/question-test-dryrun", {
                method: "POST",
                body: JSON.stringify({ testCode, testFramework: framework }),
            });
            setDryRunState(res.ok ? "ok" : "error");
            setDryRunMessage(res.message ?? "");
        } catch (err: any) {
            setDryRunState("error");
            setDryRunMessage(err?.message ?? "Dry run failed");
        }
    }

    return (
        <div>
            {/* Opt-in toggle */}
            <button
                onClick={() => onEnabledChange(!enabled)}
                className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition",
                    enabled
                        ? "border-[#a7c8b3]/30 bg-[#a7c8b3]/[0.06]"
                        : "border-white/5 bg-white/[0.03] hover:bg-white/[0.05]"
                )}
            >
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "flex size-9 items-center justify-center rounded-lg border",
                        enabled ? "border-[#a7c8b3]/30 bg-[#a7c8b3]/10 text-[#a7c8b3]" : "border-white/5 bg-white/[0.04] text-zinc-500"
                    )}>
                        <FlaskConical className="size-4" />
                    </div>
                    <div>
                        <p className={cn("text-sm font-medium", enabled ? "text-zinc-100" : "text-zinc-300")}>
                            Add a test suite
                        </p>
                        <p className="text-xs text-zinc-600">
                            Optional. Answers will be run against it for a &quot;✓ Verified&quot; badge.
                        </p>
                    </div>
                </div>
                <span
                    className={cn(
                        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
                        enabled ? "bg-[#a7c8b3]" : "bg-white/10"
                    )}
                >
                    <span
                        className={cn(
                            "absolute top-0.5 size-5 rounded-full bg-[#08100b] transition-transform",
                            enabled ? "translate-x-[22px]" : "translate-x-0.5"
                        )}
                    />
                </span>
            </button>

            <AnimatePresence>
                {enabled && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className="mt-4 space-y-4">
                            {/* Framework picker */}
                            <div>
                                <p className="mb-2 text-xs text-zinc-600">Framework</p>
                                <div className="flex flex-wrap gap-2">
                                    {FRAMEWORK_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.framework}
                                            onClick={() => selectFramework(opt)}
                                            className={cn(
                                                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                                                opt.framework === framework
                                                    ? "border-[#a7c8b3]/20 bg-[#a7c8b3] text-[#08100b]"
                                                    : "border-white/5 bg-white/[0.04] text-zinc-500 hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                                            )}
                                        >
                                            {opt.label}
                                            {!opt.dryRunSupported && (
                                                <span className="ml-1.5 text-[10px] opacity-60">no dry run yet</span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Language picker — only shown when the framework has more than one */}
                            {selectedFramework && selectedFramework.languages.length > 1 && (
                                <div>
                                    <p className="mb-2 text-xs text-zinc-600">Language</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedFramework.languages.map((lang) => (
                                            <button
                                                key={lang.id}
                                                onClick={() => onLanguageChange(lang.id)}
                                                className={cn(
                                                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                                                    lang.id === language
                                                        ? "border-[#a7c8b3]/20 bg-[#a7c8b3] text-[#08100b]"
                                                        : "border-white/5 bg-white/[0.04] text-zinc-500 hover:border-[#a7c8b3]/30 hover:text-[#a7c8b3]"
                                                )}
                                            >
                                                {lang.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Editor */}
                            {selectedFramework && (
                                <div>
                                    <p className="mb-2 text-xs text-zinc-600">Test code</p>
                                    <div className="overflow-hidden rounded-xl border border-white/5">
                                        <Editor
                                            height="280px"
                                            language={monacoLanguage}
                                            theme="vs-dark"
                                            value={testCode || (TEST_CODE_PLACEHOLDER[selectedFramework.framework] ?? "")}
                                            onChange={(value) => onTestCodeChange(value ?? "")}
                                            options={{
                                                fontSize: 13,
                                                minimap: { enabled: false },
                                                scrollBeyondLastLine: false,
                                                padding: { top: 12, bottom: 12 },
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Dry run */}
                            {selectedFramework?.dryRunSupported && (
                                <div>
                                    <button
                                        onClick={runDryRun}
                                        disabled={!testCode.trim() || dryRunState === "running"}
                                        className="flex h-9 items-center gap-2 rounded-xl border border-white/5 bg-white/[0.04] px-4 text-sm text-zinc-300 transition hover:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-40"
                                    >
                                        {dryRunState === "running" ? (
                                            <Loader2 className="size-4 animate-spin" />
                                        ) : (
                                            <Play className="size-4" />
                                        )}
                                        Dry run
                                    </button>

                                    <AnimatePresence>
                                        {dryRunState !== "idle" && dryRunState !== "running" && dryRunMessage && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 4 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 4 }}
                                                className={cn(
                                                    "mt-3 flex items-start gap-2 rounded-xl border p-3 text-xs",
                                                        dryRunState === "ok"
                                                        ? "border-emerald-500/10 bg-emerald-400/5 text-emerald-200/70"
                                                        : "border-red-500/10 bg-red-400/5 text-red-200/70"
                                                )}
                                            >
                                                {dryRunState === "ok" ? (
                                                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                                                ) : (
                                                    <XCircle className="mt-0.5 size-3.5 shrink-0" />
                                                )}
                                                <span>{dryRunMessage}</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
