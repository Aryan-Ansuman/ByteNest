import { headers } from "next/headers";
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
    const authHeader = headers().get("authorization") || headers().get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw unauthorizedResponse("Missing or invalid Authorization header");
    }

    const jwt = authHeader.split(" ")[1];

    // Build a per-request client scoped to this session — never use the
    // API-key client for session verification because that bypasses auth.
    const client = new Client()
        .setEndpoint(env.appwrite.endpoint)
        .setProject(env.appwrite.projectId)
        .setJWT(jwt);

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
