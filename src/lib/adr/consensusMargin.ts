import { databases } from "@/models/server/config";
import { db, systemConfigCollection } from "@/models/name";

// ─── Architecture Decision Record (ADR) Questions — Phase 8 ────────────────
// Configurable threshold: the aggregate gap (sum of Option A weighted means
// minus sum of Option B weighted means, across all selected dimensions)
// must exceed this margin for the consensus worker to conclude the ADR.
// Mirrors the getActiveEmbeddingModel / getDailyCap pattern already used
// elsewhere in this codebase for system_config-backed values — a document
// keyed by a fixed id, with a hardcoded fallback if it hasn't been seeded
// yet (see scripts/migrate-phase8-adr-consensus-config.ts).
const CONFIG_DOC_ID = "adr_consensus";
const DEFAULT_MIN_CONSENSUS_MARGIN = 1.0;

export async function getMinConsensusMargin(): Promise<number> {
    try {
        const doc = await databases.getDocument(db, systemConfigCollection, CONFIG_DOC_ID);
        const margin = Number(doc.minConsensusMargin);
        return Number.isFinite(margin) && margin > 0 ? margin : DEFAULT_MIN_CONSENSUS_MARGIN;
    } catch (err: any) {
        if (err?.code === 404) return DEFAULT_MIN_CONSENSUS_MARGIN;
        throw err;
    }
}
