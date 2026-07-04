/**
 * Code Smell Auto-Tagger — Phase 5 LLM client.
 * Thin wrapper around a JSON-mode chat completion, mirroring the
 * provider/mock-fallback shape of `similarity/nlp/embeddingClient.ts` so
 * local dev and CI never need a real API key.
 */

const DEFAULT_MODEL = "gemini-2.5-flash";

export type LlmSmellValidationResult = {
    raw: string;
    model: string;
    mocked: boolean;
};

export async function callSmellValidationLLM(prompt: string): Promise<LlmSmellValidationResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
        return { raw: mockResponse(), model: "mock-smell-validation-local", mocked: true };
    }

    const model = process.env.SMELL_LLM_MODEL ?? DEFAULT_MODEL;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            systemInstruction: {
                parts: [{ text: "You are a static-analysis assistant for a developer Q&A site. You only confirm or reject candidate code smells from a fixed list you are given — you never invent new smell identifiers. Respond with JSON only." }]
            },
            contents: [
                { parts: [{ text: prompt }] }
            ],
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0
            }
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Gemini API failed (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const content: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
        throw new Error("Gemini API returned no content");
    }

    return { raw: content, model, mocked: false };
}

/**
 * Deterministic empty-result mock — "no additional smells found" is always
 * a safe response (Phase 5 is additive, never required), so the mock never
 * needs to simulate a specific detection to be useful for local testing.
 */
function mockResponse(): string {
    return JSON.stringify({ smells: [] });
}
