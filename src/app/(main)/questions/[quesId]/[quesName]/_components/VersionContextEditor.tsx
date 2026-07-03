"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api-fetch";
import type { TechEcosystem } from "@/models/name";

export type VersionContextValue = {
    techPackage: string;
    techEcosystem: TechEcosystem | null;
    versionMin: string;
    versionMax: string;
};

export const EMPTY_VERSION_CONTEXT: VersionContextValue = {
    techPackage: "",
    techEcosystem: null,
    versionMin: "",
    versionMax: "",
};

interface Props {
    questionTags: string[];
    value: VersionContextValue;
    onChange: (value: VersionContextValue) => void;
    disabled?: boolean;
}

export default function VersionContextEditor({ questionTags, value, onChange, disabled }: Props) {
    const [expanded, setExpanded] = React.useState(false);
    const prefillAttempted = React.useRef(false);

    // Pre-fill from the question's tags the first time the section is
    // expanded — never overwrites something the user already typed.
    React.useEffect(() => {
        if (!expanded || prefillAttempted.current || value.techPackage) return;
        prefillAttempted.current = true;

        if (questionTags.length === 0) return;

        (async () => {
            try {
                const res = await apiFetch<{ match: { tag: string; ecosystem: TechEcosystem; packageName: string } | null }>(
                    `/api/tech-package-map?tags=${encodeURIComponent(questionTags.join(","))}`
                );
                if (res.match) {
                    onChange({
                        ...value,
                        techPackage: res.match.packageName,
                        techEcosystem: res.match.ecosystem,
                    });
                }
            } catch {
                // Non-fatal — the field just stays blank, user can type it manually.
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expanded, questionTags]);

    function updatePackageName(name: string) {
        // Editing the package name manually invalidates any auto-detected
        // ecosystem — per the spec, ecosystem is read-only and derived,
        // never independently user-editable. Re-resolving it happens
        // server-side at submission time if left blank; here we just clear
        // the stale guess so it doesn't look authoritative.
        onChange({ ...value, techPackage: name, techEcosystem: name.trim() ? value.techEcosystem : null });
    }

    return (
        <div className="mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02]">
            <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                disabled={disabled}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
            >
                <span className="flex items-center gap-2 text-xs font-medium text-zinc-400">
                    <Tag className="size-3.5" />
                    Version context
                    <span className="text-zinc-600">— optional</span>
                </span>
                <ChevronDown className={cn("size-3.5 text-zinc-600 transition-transform", expanded && "rotate-180")} />
            </button>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        <div className="space-y-3 border-t border-white/[0.06] px-4 py-3">
                            <p className="text-xs text-zinc-600">
                                Specify what version of the technology this answer was written for. It&apos;ll be checked periodically and flagged if it may be outdated.
                            </p>

                            <div>
                                <label className="mb-1 block text-[11px] font-medium text-zinc-500">
                                    Technology package
                                </label>
                                <input
                                    type="text"
                                    value={value.techPackage}
                                    onChange={(e) => updatePackageName(e.target.value)}
                                    disabled={disabled}
                                    placeholder="e.g. react"
                                    className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-zinc-200 placeholder:text-zinc-700 focus:border-[#CFE8D5]/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>

                            {value.techEcosystem && (
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium text-zinc-500">
                                        Ecosystem
                                    </label>
                                    <span className="inline-flex h-7 items-center rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 text-xs text-zinc-400">
                                        {ECOSYSTEM_LABELS[value.techEcosystem]}
                                    </span>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium text-zinc-500">
                                        From version
                                    </label>
                                    <input
                                        type="text"
                                        value={value.versionMin}
                                        onChange={(e) => onChange({ ...value, versionMin: e.target.value })}
                                        disabled={disabled}
                                        placeholder="16.0"
                                        className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-zinc-200 placeholder:text-zinc-700 focus:border-[#CFE8D5]/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-[11px] font-medium text-zinc-500">
                                        To version
                                    </label>
                                    <input
                                        type="text"
                                        value={value.versionMax}
                                        onChange={(e) => onChange({ ...value, versionMax: e.target.value })}
                                        disabled={disabled}
                                        placeholder="18.3"
                                        className="h-9 w-full rounded-lg border border-white/[0.08] bg-black/20 px-3 text-sm text-zinc-200 placeholder:text-zinc-700 focus:border-[#CFE8D5]/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                                    />
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const ECOSYSTEM_LABELS: Record<TechEcosystem, string> = {
    npm: "npm",
    pypi: "PyPI",
    crates: "crates.io",
    github: "GitHub Releases",
};
