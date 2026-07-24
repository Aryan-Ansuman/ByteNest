"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuestionDetail, type AnswerDoc } from "./QuestionDetailContext";

/** Walks the parentAnswerId chain (max depth 3) to find the root answer a branch belongs to. */
function resolveRootId(answerId: string, byId: Map<string, AnswerDoc>): string {
    let currentId = answerId;
    for (let hop = 0; hop < 4; hop++) {
        const current = byId.get(currentId);
        if (!current || !current.parentAnswerId) return currentId;
        currentId = current.parentAnswerId;
    }
    return currentId;
}

function parseSetupParam(raw: string | null): Set<string> {
    if (!raw) return new Set();
    return new Set(
        raw
            .split(",")
            .map((s) => decodeURIComponent(s.trim()))
            .filter(Boolean)
    );
}

export default function SetupNavigator() {
    const { answers, visibleConditions, navigatorSelections, setNavigatorSelections } = useQuestionDetail();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [expanded, setExpanded] = React.useState(true);
    const initializedFromUrl = React.useRef(false);

    // Read the ?setup=CommonJS,Windows param once on mount so a shared link
    // lands the recipient on the same filtered view.
    React.useEffect(() => {
        if (initializedFromUrl.current) return;
        initializedFromUrl.current = true;
        const fromUrl = parseSetupParam(searchParams.get("setup"));
        if (fromUrl.size > 0) {
            setNavigatorSelections(fromUrl);
            setExpanded(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const branchAnswers = React.useMemo(
        () => answers.documents.filter((a) => Boolean(a.parentAnswerId)),
        [answers.documents]
    );
    const totalBranchCount = branchAnswers.length;

    const matchCount = React.useMemo(() => {
        if (navigatorSelections.size === 0) return totalBranchCount;
        return branchAnswers.filter((a) => a.condition && navigatorSelections.has(a.condition)).length;
    }, [branchAnswers, navigatorSelections, totalBranchCount]);

    const toggleChip = (condition: string) => {
        const next = new Set(navigatorSelections);
        if (next.has(condition)) next.delete(condition);
        else next.add(condition);
        applySelections(next);
    };

    const clearFilters = () => applySelections(new Set());

    const applySelections = (next: Set<string>) => {
        setNavigatorSelections(next);

        const nextParams = new URLSearchParams(searchParams.toString());
        if (next.size > 0) {
            nextParams.set("setup", Array.from(next).map(encodeURIComponent).join(","));
        } else {
            nextParams.delete("setup");
        }
        const query = nextParams.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    };

    // Auto-navigate: if the current selection unambiguously points to one
    // root answer's branches, scroll to it — no manual scanning needed.
    React.useEffect(() => {
        if (navigatorSelections.size === 0) return;

        const byId = new Map(answers.documents.map((a) => [a.$id, a] as const));
        const conditionsByRoot = new Map<string, Set<string>>();
        for (const branch of branchAnswers) {
            if (!branch.condition) continue;
            const rootId = resolveRootId(branch.$id, byId);
            if (!conditionsByRoot.has(rootId)) conditionsByRoot.set(rootId, new Set());
            conditionsByRoot.get(rootId)!.add(branch.condition);
        }

        const matchingRoots = Array.from(conditionsByRoot.entries()).filter(([, conditions]) =>
            Array.from(navigatorSelections).every((selected) => conditions.has(selected))
        );

        if (matchingRoots.length === 1) {
            const [rootId] = matchingRoots[0];
            document.getElementById(`answer-${rootId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [navigatorSelections, branchAnswers, answers.documents]);

    if (visibleConditions.length === 0) return null;

    return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015]">
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
            >
                <span className="flex items-center gap-2.5 text-sm font-semibold text-zinc-200">
                    <Sliders className="size-4 text-[#a7c8b3]" />
                    Find the answer for your setup
                    {navigatorSelections.size > 0 && (
                        <span className="rounded-full bg-[#a7c8b3]/15 px-2 py-0.5 text-[11px] font-bold text-[#a7c8b3]">
                            {navigatorSelections.size}
                        </span>
                    )}
                </span>
                <ChevronDown
                    className={cn("size-4 text-zinc-500 transition-transform", expanded && "rotate-180")}
                />
            </button>

            <div
                className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
            >
                <div className="overflow-hidden">
                    <div className="px-4 pb-4">
                        <p className="mb-3 text-sm text-zinc-500">
                            This question has answers for different setups. Select yours:
                        </p>

                        <div className="flex flex-wrap gap-2">
                            {visibleConditions.map((condition) => {
                                const active = navigatorSelections.has(condition);
                                return (
                                    <button
                                        key={condition}
                                        type="button"
                                        onClick={() => toggleChip(condition)}
                                        aria-pressed={active}
                                        className={cn(
                                            "rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                                            active
                                                ? "bg-[#a7c8b3] text-[#08100B]"
                                                : "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.1] hover:text-zinc-200"
                                        )}
                                    >
                                        {condition}
                                    </button>
                                );
                            })}
                        </div>

                        {navigatorSelections.size > 0 && (
                            <div className="mt-3 flex items-center justify-between gap-3">
                                <p className="text-xs text-zinc-500">
                                    Showing {matchCount} of {totalBranchCount} branches
                                </p>
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="text-xs font-medium text-[#a7c8b3] transition hover:text-[#c5e3d0]"
                                >
                                    Clear filters
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
