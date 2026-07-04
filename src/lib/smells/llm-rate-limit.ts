import { databases } from "@/models/server/config";
import { db, systemConfigCollection } from "@/models/name";

const CONFIG_DOC_ID = "code_smell_llm";
const DEFAULT_DAILY_CAP = 200;

function usageDocId(date: Date): string {
    return `code_smell_llm_usage_${date.toISOString().slice(0, 10)}`;
}

async function getDailyCap(): Promise<number> {
    try {
        const doc = await databases.getDocument(db, systemConfigCollection, CONFIG_DOC_ID);
        const cap = Number(doc.dailyCallCap);
        return Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_DAILY_CAP;
    } catch (err: any) {
        if (err?.code === 404) return DEFAULT_DAILY_CAP;
        throw err;
    }
}

/**
 * Checks whether today's LLM call budget has room, and if so, atomically-ish
 * increments the counter (read-then-write, same accepted-race pattern as
 * other denormalized counters in this codebase like `totalVotes` — a couple
 * of calls slipping through right at the cap boundary during a traffic
 * spike is an acceptable trade for not needing a transaction here).
 *
 * Returns true if the call is allowed to proceed, false if the cap has
 * been reached — in which case the caller must skip the LLM call and keep
 * only the pattern-matched high-confidence smells (Phase 0 decision 4).
 */
export async function tryConsumeLlmCallBudget(): Promise<boolean> {
    const cap = await getDailyCap();
    const docId = usageDocId(new Date());

    let currentCount = 0;
    let exists = true;
    try {
        const doc = await databases.getDocument(db, systemConfigCollection, docId);
        currentCount = Number(doc.callCount) || 0;
    } catch (err: any) {
        if (err?.code === 404) {
            exists = false;
        } else {
            throw err;
        }
    }

    if (currentCount >= cap) return false;

    try {
        if (exists) {
            await databases.updateDocument(db, systemConfigCollection, docId, {
                callCount: currentCount + 1,
            });
        } else {
            await databases.createDocument(db, systemConfigCollection, docId, {
                callCount: 1,
            });
        }
    } catch (err: any) {
        // Two processors raced to create today's usage doc — the loser's
        // createDocument throws 409; treat as "budget consumed by the
        // winner" rather than failing the caller's whole job.
        if (err?.code !== 409) throw err;
    }

    return true;
}
