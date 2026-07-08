"use client";

import React from "react";
import { ChevronDown, MessageSquarePlus } from "lucide-react";
import AnswerCard from "./AnswerCard";
import type { AnswerDoc } from "./QuestionDetailContext";

interface PrLineAnswerThreadProps {
    answers: AnswerDoc[];
    onAddAnother: () => void;
}

// Reuses AnswerCard as-is for each answer in the thread — same avatar,
// display name, reputation, MarkdownPreview'd content, and vote rail as
// everywhere else in the app (Phase 6: "using the existing vote component
// — zero changes needed"). This component only adds the collapse-after-
// first-reply behavior and the "add another answer here" affordance.
export default function PrLineAnswerThread({ answers, onAddAnother }: PrLineAnswerThreadProps) {
    const [expanded, setExpanded] = React.useState(false);
    if (answers.length === 0) return null;

    const [first, ...rest] = answers;

    return (
        <div className="my-2 space-y-2 border-l-2 border-[#CFE8D5]/20 pl-3">
            <AnswerCard answer={first} />

            {rest.length > 0 && !expanded && (
                <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="flex items-center gap-1.5 pl-1 text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
                >
                    <ChevronDown className="size-3.5" />
                    {rest.length} more {rest.length === 1 ? "reply" : "replies"}
                </button>
            )}

            {expanded && rest.map((answer) => <AnswerCard key={answer.$id} answer={answer} />)}

            <button
                type="button"
                onClick={onAddAnother}
                className="flex items-center gap-1.5 pl-1 text-xs font-medium text-[#a7c8b3] transition hover:text-[#CFE8D5]"
            >
                <MessageSquarePlus className="size-3.5" />
                Add another answer here
            </button>
        </div>
    );
}
