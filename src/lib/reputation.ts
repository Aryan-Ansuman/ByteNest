import { users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";
import { withMutex } from "@/lib/mutex";

/**
 * Best-effort reputation adjustment, shared by every route that touches it
 * (votes, answers, questions). Appwrite's Users API has no atomic-increment
 * equivalent for prefs, so this leans on the process-wide mutex in
 * `withMutex` to close the read-modify-write race as much as possible
 * without infra changes. The durable fix is moving reputation out of prefs
 * into a real document attribute so it can use Appwrite's atomic
 * increment/decrement-attribute calls instead.
 */
export async function adjustReputation(userId: string, delta: number): Promise<number> {
    if (delta === 0) {
        const prefs = await users.getPrefs<UserPrefs>(userId);
        return Number(prefs.reputation ?? 0);
    }

    return withMutex(`reputation:${userId}`, async () => {
        const prefs = await users.getPrefs<UserPrefs>(userId);
        const next = Number(prefs.reputation ?? 0) + delta;
        await users.updatePrefs<UserPrefs>(userId, { reputation: next });
        return next;
    });
}
