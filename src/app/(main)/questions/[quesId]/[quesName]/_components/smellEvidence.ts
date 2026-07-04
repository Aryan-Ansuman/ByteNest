import { getSmellDefinition } from "@/lib/smells/catalog";

export type ConfidenceLevel = "high" | "medium" | "low";

export type RawSmellEvidenceEntry = {
    smell: string;
    confidence?: ConfidenceLevel | string;
    triggeredBy?: string;
    lineNumbers?: number[];
    reasoning?: string;
    source?: "pattern" | "llm";
};

export type GroupedSmell = {
    id: string;
    displayName: string;
    description: string;
    confidence: ConfidenceLevel;
    entries: RawSmellEvidenceEntry[];
};

const CONFIDENCE_RANK: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };

function normalizeConfidence(value: unknown): ConfidenceLevel {
    return value === "high" || value === "medium" || value === "low" ? value : "medium";
}

export function parseSmellEvidence(raw: string | null | undefined): RawSmellEvidenceEntry[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((entry): entry is RawSmellEvidenceEntry => Boolean(entry) && typeof entry.smell === "string");
    } catch {
        return [];
    }
}

/**
 * One row per smell in `systemTags`, aggregating however many evidence
 * entries (pattern-matched and/or LLM-confirmed) exist for it and taking
 * the highest confidence among them for the dot display.
 */
export function groupSmellsForPanel(systemTags: string[], evidence: RawSmellEvidenceEntry[]): GroupedSmell[] {
    return systemTags.map((smellId) => {
        const entries = evidence.filter((e) => e.smell === smellId);
        const catalogEntry = getSmellDefinition(smellId);

        const confidence = entries.reduce<ConfidenceLevel>((best, entry) => {
            const level = normalizeConfidence(entry.confidence);
            return CONFIDENCE_RANK[level] > CONFIDENCE_RANK[best] ? level : best;
        }, entries.length ? "low" : "medium");

        return {
            id: smellId,
            displayName: catalogEntry?.displayName ?? humanizeFallback(smellId),
            description: catalogEntry?.description ?? "A system-detected pattern in this question's code.",
            confidence,
            entries,
        };
    });
}

function humanizeFallback(id: string): string {
    return id
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}
