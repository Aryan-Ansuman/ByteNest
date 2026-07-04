import { redirect } from "next/navigation";
import { Query } from "node-appwrite";
import { db, smellAccuracySnapshotsCollection } from "@/models/name";
import { databases } from "@/models/server/config";
import { getLoggedInUser } from "@/lib/server-auth";

// ⚠️ PLACEHOLDER GATING — there is no admin-role system anywhere in this
// codebase. This checks the logged-in user's email against a static env
// list, which is fine for a single-operator/demo deployment but is NOT a
// real authorization model (no audit trail, no revocation without a
// redeploy, trivially wrong the moment more than one admin exists). Replace
// with real role-based access control before this page is exposed beyond
// you personally.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

type SmellBreakdownEntry = {
  smellId: string;
  language: string;
  correct: number;
  incorrect: number;
  total: number;
  incorrectRate: number;
};

export default async function SmellAccuracyPage() {
    const user = await getLoggedInUser().catch(() => null);
    if (!user || !ADMIN_EMAILS.includes((user.email ?? "").toLowerCase())) {
        redirect("/");
    }

    const snapshots = await databases.listDocuments(db, smellAccuracySnapshotsCollection, [
        Query.orderDesc("windowEnd"),
        Query.limit(30),
    ]);

    const latest = snapshots.documents[0];
    const latestBreakdown: SmellBreakdownEntry[] = latest ? JSON.parse((latest.perSmellBreakdown as string) ?? "[]") : [];
    const latestAlerts: string[] = latest ? JSON.parse((latest.alertReasons as string) ?? "[]") : [];

    // Detection volume over time, per smell — flattened across all fetched snapshots.
    const volumeOverTime = snapshots.documents.map((doc) => ({
        windowEnd: doc.windowEnd as string,
        totalFeedbackVotes: doc.totalFeedbackVotes as number,
        alertFired: Boolean(doc.alertFired),
    }));

    const languageBreakdown = new Map<string, { correct: number; incorrect: number }>();
    for (const entry of latestBreakdown) {
        const bucket = languageBreakdown.get(entry.language) ?? { correct: 0, incorrect: 0 };
        bucket.correct += entry.correct;
        bucket.incorrect += entry.incorrect;
        languageBreakdown.set(entry.language, bucket);
    }

    return (
        <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-10">
            <div>
                <h1 className="text-2xl font-semibold text-zinc-50">Smell Detection Accuracy</h1>
                <p className="mt-1 text-sm text-zinc-500">
                    {latest ? `Latest window: ${new Date(latest.windowStart as string).toLocaleDateString()} – ${new Date(latest.windowEnd as string).toLocaleDateString()}` : "No snapshots yet — the nightly accuracy job hasn't run."}
                </p>
            </div>

            {latestAlerts.length > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4">
                    <p className="mb-2 text-sm font-medium text-amber-300">⚠️ Active accuracy alerts</p>
                    <ul className="space-y-1 text-sm text-amber-200/80">
                        {latestAlerts.map((reason, i) => <li key={i}>{reason}</li>)}
                    </ul>
                </div>
            )}

            <section>
                <h2 className="mb-3 text-sm font-medium text-zinc-400">Precision per smell (latest 7-day window)</h2>
                <div className="overflow-hidden rounded-xl border border-white/5">
                    <table className="w-full text-sm">
                        <thead className="bg-white/[0.03] text-left text-xs text-zinc-500">
                            <tr>
                                <th className="px-4 py-2">Smell</th>
                                <th className="px-4 py-2">Language</th>
                                <th className="px-4 py-2">Precision</th>
                                <th className="px-4 py-2">Votes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {latestBreakdown.map((entry) => (
                                <tr key={entry.smellId} className="border-t border-white/5">
                                    <td className="px-4 py-2 text-zinc-200">{entry.smellId}</td>
                                    <td className="px-4 py-2 text-zinc-500">{entry.language}</td>
                                    <td className={`px-4 py-2 ${entry.incorrectRate > 0.4 ? "text-red-400" : "text-zinc-300"}`}>
                                        {((1 - entry.incorrectRate) * 100).toFixed(0)}%
                                    </td>
                                    <td className="px-4 py-2 text-zinc-500">{entry.total}</td>
                                </tr>
                            ))}
                            {latestBreakdown.length === 0 && (
                                <tr><td colSpan={4} className="px-4 py-6 text-center text-zinc-600">No feedback votes in this window yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section>
                <h2 className="mb-3 text-sm font-medium text-zinc-400">Language breakdown</h2>
                <div className="flex flex-wrap gap-3">
                    {Array.from(languageBreakdown.entries()).map(([language, { correct, incorrect }]) => (
                        <div key={language} className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                            <p className="text-xs text-zinc-500">{language}</p>
                            <p className="text-lg font-semibold text-zinc-100">{correct + incorrect} votes</p>
                            <p className="text-xs text-zinc-600">{correct} correct / {incorrect} incorrect</p>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <h2 className="mb-3 text-sm font-medium text-zinc-400">Detection volume over time</h2>
                <div className="space-y-1">
                    {volumeOverTime.map((point) => (
                        <div key={point.windowEnd} className="flex items-center gap-3 text-xs text-zinc-500">
                            <span className="w-24">{new Date(point.windowEnd).toLocaleDateString()}</span>
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                                <div
                                    className={`h-full ${point.alertFired ? "bg-red-500/60" : "bg-emerald-500/50"}`}
                                    style={{ width: `${Math.min(100, point.totalFeedbackVotes)}%` }}
                                />
                            </div>
                            <span className="w-10 text-right">{point.totalFeedbackVotes}</span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
