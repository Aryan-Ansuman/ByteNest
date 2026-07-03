"use client";

import React from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-fetch";
import type { AnswerDoc } from "./QuestionDetailContext";

interface Props {
    answerId: string;
    disabled?: boolean;
    onConfirmed: (result: { freshnessScore: number; freshnessLabel: AnswerDoc["freshnessLabel"]; verifiedByAuthorAt: string }) => void;
}

export default function ConfirmStillValidButton({ answerId, disabled = false, onConfirmed }: Props) {
    const [submitting, setSubmitting] = React.useState(false);

    async function handleConfirm() {
        if (submitting) return;
        setSubmitting(true);
        try {
            const res = await apiFetch<{
                data: { freshnessScore: number; freshnessLabel: AnswerDoc["freshnessLabel"]; verifiedByAuthorAt: string };
            }>(`/api/answer/${answerId}/still-valid`, { method: "POST" });
            onConfirmed(res.data);
            toast.success("Marked as still valid");
        } catch (error: any) {
            toast.error(error?.message ?? "Couldn't confirm this answer");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <button
            onClick={handleConfirm}
            disabled={disabled || submitting}
            title="Confirm this answer still applies to the current version"
            className="flex items-center gap-1.5 rounded-full border border-[#CFE8D5]/20 bg-[#CFE8D5]/10 px-2.5 py-1 text-xs font-medium text-[#CFE8D5] transition hover:bg-[#CFE8D5]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {submitting ? <Loader2 className="size-3 animate-spin" /> : <BadgeCheck className="size-3" />}
            {submitting ? "Confirming…" : "Confirm still valid"}
        </button>
    );
}
