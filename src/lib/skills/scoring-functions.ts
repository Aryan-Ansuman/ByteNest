/**
 * Phase 2 — Step 2.1
 * Pure scoring functions — no database calls, fully testable in isolation.
 *
 * Each function takes raw activity data and returns a number 0–100.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AnswerActivity {
    answerId: string;
    questionId: string;
    isAccepted: boolean;
    upvotes: number;
    downvotes: number;
    createdAt: string; // ISO
}

export interface QuestionActivity {
    questionId: string;
    upvotes: number;
    downvotes: number;
    totalAnswers: number;
    createdAt: string; // ISO
}

export interface PeerVoter {
    voterId: string;
    /** The composite score of the peer who cast an upvote (0–100). */
    voterCompositeScore: number;
}

// ─── Step 2.1a — Answer Quality Score ─────────────────────────────────────────
//
// Measures how good a user's answers are in a given tag.
// Formula:
//   - Base: upvote ratio weighted by answer count
//   - Bonus: acceptance rate adds up to +30 pts
//   - Penalty: downvotes reduce the score
//   - Scale: capped at 100
//
// Weight breakdown:
//   70% upvote signal, 30% acceptance rate

export function computeAnswerQualityScore(answers: AnswerActivity[]): number {
    if (answers.length === 0) return 0;

    const totalUpvotes    = answers.reduce((s, a) => s + a.upvotes, 0);
    const totalDownvotes  = answers.reduce((s, a) => s + a.downvotes, 0);
    const totalVotes      = totalUpvotes + totalDownvotes;
    const acceptedCount   = answers.filter((a) => a.isAccepted).length;

    // Upvote ratio (0–1), guarded against zero-vote answers
    const upvoteRatio = totalVotes > 0 ? totalUpvotes / totalVotes : 0;

    // Volume bonus: more answers → more confident the ratio is real.
    // Logarithmic so a user with 50 answers isn't overwhelmingly favoured.
    const volumeMultiplier = Math.min(1, Math.log10(answers.length + 1) / Math.log10(21));

    // Raw upvote signal: 0–70
    const upvoteSignal = upvoteRatio * 70 * volumeMultiplier;

    // Acceptance rate signal: 0–30
    const acceptanceRate = acceptedCount / answers.length;
    const acceptanceSignal = acceptanceRate * 30;

    const raw = upvoteSignal + acceptanceSignal;
    return Math.min(100, Math.max(0, Math.round(raw * 10) / 10));
}

// ─── Step 2.1b — Question Quality Score ───────────────────────────────────────
//
// Measures how good a user's questions are in a given tag.
// Formula:
//   - Upvote ratio (0–1) weighted by volume
//   - Engagement bonus: questions that attract answers get a boost
//   - Scale: 0–100

export function computeQuestionQualityScore(questions: QuestionActivity[]): number {
    if (questions.length === 0) return 0;

    const totalUpvotes   = questions.reduce((s, q) => s + q.upvotes, 0);
    const totalDownvotes = questions.reduce((s, q) => s + q.downvotes, 0);
    const totalVotes     = totalUpvotes + totalDownvotes;
    const totalAnswers   = questions.reduce((s, q) => s + q.totalAnswers, 0);

    const upvoteRatio = totalVotes > 0 ? totalUpvotes / totalVotes : 0;

    // Volume multiplier (same log scale as above)
    const volumeMultiplier = Math.min(1, Math.log10(questions.length + 1) / Math.log10(11));

    // Upvote signal: 0–70
    const upvoteSignal = upvoteRatio * 70 * volumeMultiplier;

    // Engagement signal: avg answers per question, capped at 3 → maps to 0–30
    const avgAnswers = totalAnswers / questions.length;
    const engagementSignal = Math.min(30, (avgAnswers / 3) * 30);

    const raw = upvoteSignal + engagementSignal;
    return Math.min(100, Math.max(0, Math.round(raw * 10) / 10));
}

// ─── Step 2.1c — Temporal Consistency Score ───────────────────────────────────
//
// Rewards users who contribute consistently over time and
// penalises (decays) those who have gone inactive.
//
// Formula:
//   - Spread: how many distinct months in the last 12 months has the user contributed?
//             12 active months → 100, 1 month → ~8
//   - Recency: last activity within 30 days → no decay;
//              6+ months inactive → significant decay (down to 20)

export function computeTemporalConsistencyScore(
    allActivityDates: string[], // ISO timestamps of any answer/question in this tag
    referenceDate: Date = new Date()
): number {
    if (allActivityDates.length === 0) return 0;

    const now      = referenceDate.getTime();
    const oneYear  = 365 * 24 * 60 * 60 * 1000;
    const oneMonth = 30  * 24 * 60 * 60 * 1000;

    // Only consider activity in the last 12 months
    const recentDates = allActivityDates
        .map((d) => new Date(d).getTime())
        .filter((t) => now - t <= oneYear && t <= now);

    if (recentDates.length === 0) {
        // No activity in the last year → maximum decay
        return 5;
    }

    // Count distinct calendar months of activity
    const activeMonths = new Set(
        recentDates.map((t) => {
            const d = new Date(t);
            return `${d.getFullYear()}-${d.getMonth()}`;
        })
    ).size;

    // Spread score: 0–80
    const spreadScore = (activeMonths / 12) * 80;

    // Recency score: 0–20
    const mostRecentActivity = Math.max(...recentDates);
    const monthsInactive     = (now - mostRecentActivity) / oneMonth;
    // 0 months inactive → 20 pts; 6+ months → 0 pts
    const recencyScore = Math.max(0, 20 - (monthsInactive / 6) * 20);

    const raw = spreadScore + recencyScore;
    return Math.min(100, Math.max(0, Math.round(raw * 10) / 10));
}

// ─── Step 2.1d — Peer Validation Score ────────────────────────────────────────
//
// An upvote from an Expert carries more weight than one from a Newcomer.
// This score rewards users whose work is recognised by knowledgeable peers.
//
// Formula:
//   - Weighted average of upvoter composite scores
//   - Volume bonus: more high-quality upvoters → higher confidence
//   - Scale: 0–100

export function computePeerValidationScore(peers: PeerVoter[]): number {
    if (peers.length === 0) return 0;

    const totalPeerScore = peers.reduce((s, p) => s + p.voterCompositeScore, 0);
    const avgPeerScore   = totalPeerScore / peers.length;

    // Volume multiplier: more qualified upvoters → more signal
    // 20+ high-quality upvoters → full multiplier
    const volumeMultiplier = Math.min(1, Math.log10(peers.length + 1) / Math.log10(21));

    const raw = avgPeerScore * volumeMultiplier;
    return Math.min(100, Math.max(0, Math.round(raw * 10) / 10));
}
