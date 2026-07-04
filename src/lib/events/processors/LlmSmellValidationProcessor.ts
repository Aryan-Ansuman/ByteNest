import type { LlmSmellValidationPayload } from "../types";
import { db, questionCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { extractCodeBlocks } from "@/lib/smells/extract-code-blocks";
import { SMELL_CATALOG, getSmellDefinition, isKnownSmellId, type SmellDefinition } from "@/lib/smells/catalog";
import { callSmellValidationLLM } from "@/lib/smells/llm-client";
import { tryConsumeLlmCallBudget } from "@/lib/smells/llm-rate-limit";

const MAX_EVIDENCE_JSON_LENGTH = 500;
const MAX_CODE_CHARS_PER_BLOCK = 2000; // keeps the prompt bounded on very long snippets

type LlmSmellResponseEntry = {
    smell?: unknown;
    confidence?: unknown;
    reasoning?: unknown;
};

type EvidenceEntry = Record<string, unknown> & { smell: string };
type PendingSmellDetection = LlmSmellValidationPayload["pendingSmells"][0];

/**
 * Code Smell Auto-Tagger — Phase 5.
 *
 * Additive-only: on any failure (rate cap hit, malformed LLM JSON, network
 * error) this always still leaves the question with whatever Phase 4
 * already wrote, and always finalizes smellAnalysisStatus to "complete" —
 * the LLM pass is never allowed to be the reason a question gets stuck in
 * "processing" forever.
 */
export async function processLlmSmellValidation(payload: LlmSmellValidationPayload): Promise<void> {
    const { questionId, pendingSmells, titleContext } = payload;

    const question = await databases.getDocument(db, questionCollection, questionId).catch((err: any) => {
        if (err?.code === 404) return null;
        throw err;
    });

    // Question deleted between enqueue and processing — nothing to validate.
    if (!question) return;

    const existingSystemTags: string[] = Array.isArray(question.systemTags) ? question.systemTags : [];
    const existingEvidence: EvidenceEntry[] = safeParseEvidence(question.smellEvidence as string | null | undefined);

    const withinBudget = await tryConsumeLlmCallBudget();
    if (!withinBudget) {
        // Phase 0 decision 4 (cost control): discard the LLM pass entirely,
        // keep only what Phase 4's pattern matching already found.
        await finalize(questionId, existingSystemTags, existingEvidence);
        console.warn(`[llm-smell-validation] Daily LLM call cap reached — skipping question ${questionId}`);
        return;
    }

    const codeBlocks = extractCodeBlocks((question.content as string) ?? "");
    const candidates = resolveCandidates(pendingSmells, codeBlocks.map((b) => b.language));

    if (candidates.length === 0) {
        // Nothing sensible to ask the model about (e.g. no matching catalog
        // entries for the languages present) — finalize as-is.
        await finalize(questionId, existingSystemTags, existingEvidence);
        return;
    }

    let confirmed: LlmSmellResponseEntry[] = [];
    try {
        const prompt = buildPrompt({ title: titleContext, codeBlocks, candidates });
        const { raw } = await callSmellValidationLLM(prompt);
        confirmed = parseLlmResponse(raw);
    } catch (err) {
        // Malformed JSON or a network/API failure — log and treat as "no
        // additional smells found". Never propagate to the question.
        console.error(`[llm-smell-validation] LLM call failed for question ${questionId}:`, err);
        confirmed = [];
    }

    const candidateIds = new Set<string>(candidates.map((c) => c.id));
    const validConfirmations = confirmed.filter(
        (entry): entry is Required<LlmSmellResponseEntry> & { smell: string } =>
            typeof entry.smell === "string" && candidateIds.has(entry.smell) && isKnownSmellId(entry.smell)
    );

    const llmEvidence: EvidenceEntry[] = validConfirmations.map((entry) => ({
        smell: entry.smell as string,
        confidence: typeof entry.confidence === "string" ? entry.confidence : "medium",
        reasoning: typeof entry.reasoning === "string" ? entry.reasoning.slice(0, 400) : undefined,
        source: "llm" as const,
    }));

    const mergedSystemTags = Array.from(
        new Set([...existingSystemTags, ...validConfirmations.map((entry) => entry.smell as string)])
    );
    const mergedEvidence = [...existingEvidence, ...llmEvidence];

    await finalize(questionId, mergedSystemTags, mergedEvidence);
}

async function finalize(questionId: string, systemTags: string[], evidence: EvidenceEntry[]): Promise<void> {
    await databases.updateDocument(db, questionCollection, questionId, {
        systemTags,
        smellEvidence: serializeEvidence(evidence),
        smellAnalysisStatus: "complete",
        smellAnalysisAt: new Date().toISOString(),
    });
}

function resolveCandidates(
    pendingSmells: PendingSmellDetection[],
    languagesPresent: string[]
): SmellDefinition[] {
    if (pendingSmells.length > 0) {
        const entries = pendingSmells
            .map((p) => getSmellDefinition(p.smell))
            .filter((entry): entry is SmellDefinition => Boolean(entry));
        return dedupeById(entries);
    }

    // Recovery path — Stage 1 found nothing, but the title has a
    // high-signal phrase (checked by the caller before enqueueing). Send
    // the full catalog so the model can catch what regex-based rules
    // missed, e.g. "why is my API slow?" with no obvious n+1 pattern.
    return SMELL_CATALOG;
}

function dedupeById(entries: SmellDefinition[]): SmellDefinition[] {
    const seen = new Set<string>();
    return entries.filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
    });
}

function buildPrompt({
    title,
    codeBlocks,
    candidates,
}: {
    title: string;
    codeBlocks: ReturnType<typeof extractCodeBlocks>;
    candidates: SmellDefinition[];
}): string {
    const codeSection = codeBlocks.length
        ? codeBlocks
              .map(
                  (block, i) =>
                      `Code block ${i + 1} (${block.language}):\n\`\`\`${block.language}\n${block.rawCode.slice(0, MAX_CODE_CHARS_PER_BLOCK)}\n\`\`\``
              )
              .join("\n\n")
        : "(No code blocks were found in the question.)";

    const candidateSection = candidates
        .map((c) => `- ${c.id}: ${c.description}`)
        .join("\n");

    return [
        `Question title: "${title}"`,
        "",
        codeSection,
        "",
        "Candidate code smells to evaluate (ONLY choose from this list — never invent a new identifier):",
        candidateSection,
        "",
        'Respond with JSON only, in the exact shape: {"smells": [{"smell": "<id from the candidate list>", "confidence": "high"|"medium"|"low", "reasoning": "<one sentence>"}]}.',
        "Only include smells you are reasonably confident actually apply to this code/question. If none apply, respond with {\"smells\": []}.",
    ].join("\n");
}

function parseLlmResponse(raw: string): LlmSmellResponseEntry[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return [];
    }

    if (!parsed || typeof parsed !== "object") return [];
    const smells = (parsed as { smells?: unknown }).smells;
    if (!Array.isArray(smells)) return [];

    return smells.filter((entry): entry is LlmSmellResponseEntry => Boolean(entry) && typeof entry === "object");
}

function safeParseEvidence(raw: string | null | undefined): EvidenceEntry[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** Keeps the serialized evidence within the schema's 5000-char field limit, trimming oldest entries first. */
function serializeEvidence(evidence: EvidenceEntry[]): string {
    let candidate = evidence;
    let serialized = JSON.stringify(candidate);

    while (serialized.length > MAX_EVIDENCE_JSON_LENGTH && candidate.length > 0) {
        candidate = candidate.slice(1);
        serialized = JSON.stringify(candidate);
    }

    return serialized;
}
