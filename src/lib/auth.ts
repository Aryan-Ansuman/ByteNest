import { cookies } from "next/headers";
import { Account, Client } from "node-appwrite";
import env from "@/app/env";

/**
 * Verifies the request carries a valid Appwrite session cookie and returns
 * the authenticated user's ID.  Throws a Response-shaped error if the
 * session is missing or invalid so callers can return it directly.
 *
 * Usage inside an API route:
 *   const userId = await getAuthenticatedUserId();
 *
 * Never trust a client-supplied `authorId` / `votedById` for authorization —
 * always use the ID returned from this function.
 */
export async function getAuthenticatedUserId(): Promise<string> {
    const cookieStore = cookies();

    // Appwrite stores the session in a cookie named `a_session_<projectId>`
    // (lowercase).  We accept both the hashed and plain variants.
    const projectId = env.appwrite.projectId.toLowerCase();
    const sessionCookie =
        cookieStore.get(`a_session_${projectId}_legacy`)?.value ??
        cookieStore.get(`a_session_${projectId}`)?.value ??
        // Fallback: some Appwrite versions use the header set by the client SDK.
        cookieStore.get("a_session")?.value;

    if (!sessionCookie) {
        throw unauthorizedResponse("No active session");
    }

    // Build a per-request client scoped to this session — never use the
    // API-key client for session verification because that bypasses auth.
    const client = new Client()
        .setEndpoint(env.appwrite.endpoint)
        .setProject(env.appwrite.projectId)
        .setSession(sessionCookie);

    const account = new Account(client);

    try {
        const user = await account.get();
        return user.$id;
    } catch {
        throw unauthorizedResponse("Invalid or expired session");
    }
}

export function unauthorizedResponse(message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
    });
}

export function forbiddenResponse(message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
    });
}
