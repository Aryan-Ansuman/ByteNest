import { Query } from "node-appwrite";
import { databases } from "@/models/server/config";
import { db, reputationEventsCollection } from "@/models/name";

export interface SocraticSessionEntry {
    $id: string;
    role: "seeker" | "helper";
    delta: number;
    savedToQnA: boolean;
    createdAt: string;
    /** The room this session happened in — only known for "helper" events
     *  and "seeker" events where no answer was saved. Null when the source
     *  is an answer ID instead (see class doc comment). */
    roomId: string | null;
    /** The saved answer's ID, when savedToQnA is true. */
    answerId: string | null;
}

export interface SocraticSessionSummary {
    totalSessions: number;
    asHelper: number;
    asSeeker: number;
    savedToQnA: number;
    sessions: SocraticSessionEntry[];
}

/**
 * Derives a user's Socratic Debugging Mode participation history purely
 * from the reputation_events log — no dedicated schema. Both event types
 * fire once per session (Phase 0, Decision 10), so counting events is
 * equivalent to counting sessions.
 *
 *  - "socratic_question_asked" → the user helped in that session.
 *    sourceId is always the roomId.
 *  - "socratic_session_completed" → the user was the seeker.
 *    sourceId is the saved answer's ID if a linked question existed,
 *    otherwise the roomId (see Phase 8's teardown / Phase 9 spec).
 *
 * Because there's no join table, a seeker-role entry whose root cause was
 * saved to Q&A doesn't carry its roomId in the event — only the answer ID.
 * That's a known, accepted limitation of the no-new-schema design; those
 * entries link to the answer instead of the room.
 */
export async function getSocraticSessionSummary(
    userId: string,
    limit = 50
): Promise<SocraticSessionSummary> {
    const result = await databases.listDocuments(db, reputationEventsCollection, [
        Query.equal("userId", userId),
        Query.equal("eventType", ["socratic_question_asked", "socratic_session_completed"]),
        Query.orderDesc("createdAt"),
        Query.limit(limit),
    ]);

    const sessions: SocraticSessionEntry[] = result.documents.map((doc) => {
        const isSeeker = doc.eventType === "socratic_session_completed";
        const savedToQnA = isSeeker && doc.sourceType === "answer";

        return {
            $id: doc.$id,
            role: isSeeker ? "seeker" : "helper",
            delta: doc.delta as number,
            savedToQnA,
            createdAt: doc.createdAt as string,
            roomId: savedToQnA ? null : (doc.sourceId as string | null),
            answerId: savedToQnA ? (doc.sourceId as string) : null,
        };
    });

    return {
        totalSessions: sessions.length,
        asHelper: sessions.filter((s) => s.role === "helper").length,
        asSeeker: sessions.filter((s) => s.role === "seeker").length,
        savedToQnA: sessions.filter((s) => s.savedToQnA).length,
        sessions,
    };
}
