import { ID, Query } from "node-appwrite";
import type { CheckAdrConsensusPayload } from "../types";
import { db, questionCollection, adrQuestionMetadataCollection, adrScoreSubmissionsCollection, notificationsCollection, commentCollection } from "@/models/name";
import { databases, users } from "@/models/server/config";
import { aggregateAdrSubmissions, type AdrScoreSubmissionInput } from "@/lib/adr/aggregation";
import { getMinConsensusMargin } from "@/lib/adr/consensusMargin";
import { labelForDimension } from "@/lib/adr/dimensionLabels";
import { postPrSystemComment } from "@/lib/pr-questions/systemComment";
import { writeReputationEvent } from "@/lib/write-reputation-event";

// Below this many submissions, the chart is labeled "Preliminary" in the UI
// (Phase 5) and the worker doesn't attempt a consensus judgement at all —
// too small a sample to declare anything.
const MIN_SUBMISSIONS_FOR_CONSENSUS = 10;

const NO_CONSENSUS_MESSAGE =
    "No clear consensus yet — community is evenly split. More assessments may clarify the picture.";

/**
 * CheckAdrConsensus processor (Phase 8). Fired after every successful ADR
 * score submission/revision (enqueued via enqueueAdrConsensusCheck, not the
 * generic publishEvent — see that file for why). Reads the *current* state
 * of adr_score_submissions at run time, so it always reflects whichever
 * submission most recently triggered it plus everything before it,
 * regardless of how many triggers got coalesced by the dedup check.
 */
export async function processCheckAdrConsensus(payload: CheckAdrConsensusPayload): Promise<void> {
    const { questionId } = payload;

    const metadataDocs = await databases.listDocuments(db, adrQuestionMetadataCollection, [
        Query.equal("questionId", questionId),
        Query.limit(1),
    ]);
    const metadata = metadataDocs.documents[0];
    if (!metadata) {
        // Question was deleted, or isn't actually an ADR question (defensive
        // — should never happen since only POST/PATCH /api/adr enqueue this).
        console.log(`[ADR Consensus] No adr_question_metadata for question ${questionId}. Skipping.`);
        return;
    }

    const dimensionIds: string[] = (() => {
        try {
            const parsed = JSON.parse(metadata.adrDimensions as string);
            return Array.isArray(parsed) ? parsed.filter((d) => typeof d === "string") : [];
        } catch {
            return [];
        }
    })();
    if (dimensionIds.length === 0) {
        console.log(`[ADR Consensus] Question ${questionId} has no adrDimensions. Skipping.`);
        return;
    }

    // ── Fetch every submission for this question, cursor-paginated ──────
    const submissions: AdrScoreSubmissionInput[] = [];
    let cursor: string | undefined;
    do {
        const queries = [Query.equal("questionId", questionId), Query.limit(100)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const page = await databases.listDocuments(db, adrScoreSubmissionsCollection, queries);
        for (const doc of page.documents) {
            submissions.push({
                optionAScores: doc.optionAScores as string,
                optionBScores: doc.optionBScores as string,
                expertise: doc.expertise as AdrScoreSubmissionInput["expertise"],
            });
        }
        cursor = page.documents.length > 0 ? page.documents[page.documents.length - 1].$id : undefined;
        if (page.documents.length < 100) break;
    } while (cursor);

    if (submissions.length < MIN_SUBMISSIONS_FOR_CONSENSUS) {
        console.log(
            `[ADR Consensus] consensusCheckSkipped — question ${questionId} has ${submissions.length}/${MIN_SUBMISSIONS_FOR_CONSENSUS} submissions.`
        );
        return;
    }

    const aggregation = aggregateAdrSubmissions(submissions, dimensionIds);
    const minMargin = await getMinConsensusMargin();

    const totalDimensions = dimensionIds.length;
    const majorityThreshold = totalDimensions / 2;

    const aWins =
        aggregation.consensus.optionALeadCount > majorityThreshold &&
        aggregation.consensus.aggregateGap >= minMargin;
    const bWins =
        aggregation.consensus.optionBLeadCount > majorityThreshold &&
        aggregation.consensus.aggregateGap <= -minMargin;

    const optionA = (metadata.optionA as string) || "Option A";
    const optionB = (metadata.optionB as string) || "Option B";
    const currentStatus = (metadata.adrStatus as string) ?? "open";

    if ((aWins || bWins) && currentStatus === "open") {
        const winningOption = aWins ? optionA : optionB;
        const otherOption = aWins ? optionB : optionA;
        const winningDimensions = aWins ? aggregation.consensus.dimensionsWonByA : aggregation.consensus.dimensionsWonByB;
        const otherLeadingDimensions = aWins ? aggregation.consensus.dimensionsWonByB : aggregation.consensus.dimensionsWonByA;

        await databases.updateDocument(db, adrQuestionMetadataCollection, metadata.$id, {
            adrStatus: "concluded",
        });

        const winningList = winningDimensions.map(labelForDimension).join(", ") || "—";
        const otherList = otherLeadingDimensions.map(labelForDimension).join(", ") || "none";

        await postPrSystemComment(
            questionId,
            `Community consensus: Based on ${submissions.length} assessments, **${winningOption}** is favored for this use case. Leading dimensions: ${winningList}. Dimensions where ${otherOption} leads: ${otherList}.`
        );

        // Notify the question author — best-effort, mirrors the
        // decay-notification write pattern (non-fatal if it fails).
        try {
            const question = await databases.getDocument(db, questionCollection, questionId);
            await databases.createDocument(db, notificationsCollection, ID.unique(), {
                userId: question.authorId,
                type: "adr_consensus_reached",
                payload: JSON.stringify({
                    questionId,
                    questionTitle: question.title,
                    winningOption,
                    submissionCount: submissions.length,
                }).slice(0, 5000),
                readAt: null,
                createdAt: new Date().toISOString(),
            });
            
            // ── Phase 9: Reputation Bonus (+15) for the question author ──
            const authorId = question.authorId;
            if (authorId) {
                const prefs = await users.getPrefs(authorId);
                const currentRep = Number(prefs.reputation ?? 0);
                const nextRep = currentRep + 15;
                await users.updatePrefs(authorId, { ...prefs, reputation: nextRep });
                
                await writeReputationEvent({
                    userId: authorId,
                    delta: 15,
                    eventType: "adr_consensus_reached",
                    reputationAfter: nextRep,
                    sourceId: questionId,
                    sourceType: "question"
                });
            }
        } catch (err: any) {
            console.error(`[ADR Consensus] Failed to process notification/reputation for question ${questionId} — ${err?.message}`);
        }

        return;
    }

    if (aggregation.consensus.isEvenlySplit && currentStatus === "open") {
        // Avoid spamming the same "evenly split" comment on every single
        // submission while the ADR stays divided — only post it if the most
        // recent system comment on this question isn't already this exact
        // message. Not specified explicitly in the Phase 8 plan, but
        // posting it unconditionally on every trigger while a comparison
        // stays divided for dozens of submissions would flood the thread.
        const recentSystemComments = await databases.listDocuments(db, commentCollection, [
            Query.equal("typeId", questionId),
            Query.equal("type", "question"),
            Query.equal("authorId", "system"),
            Query.orderDesc("$createdAt"),
            Query.limit(1),
        ]).catch(() => null);

        const alreadyPosted =
            recentSystemComments?.documents[0]?.content === NO_CONSENSUS_MESSAGE;

        if (!alreadyPosted) {
            await postPrSystemComment(questionId, NO_CONSENSUS_MESSAGE);
        }
    }

    // Neither a clear winner nor an evenly-split state (e.g. one option
    // ahead but under minConsensusMargin, or leading on fewer than half the
    // dimensions) — no action. The chart itself (Phase 5) communicates
    // "Preliminary"/"Developing" based on submission count; this worker
    // only ever writes something when the community's verdict is decisive.
}
