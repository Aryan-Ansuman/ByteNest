import { account } from "@/models/client/config";

/**
 * A wrapper around `fetch` that automatically attaches the Appwrite JWT
 * to the `Authorization` header for secure cross-domain authentication
 * with Next.js API routes.
 */
export async function apiFetch<TResponse = any>(
    input: RequestInfo | URL,
    init?: RequestInit
): Promise<TResponse> {
    let jwt = "";
    try {
        // createJWT automatically handles session checking and caching
        const result = await account.createJWT();
        jwt = result.jwt;
    } catch {
        // Not logged in or network error; proceed without auth header
    }

    const headers = new Headers(init?.headers);
    headers.set("Content-Type", "application/json");
    
    if (jwt) {
        headers.set("Authorization", `Bearer ${jwt}`);
    }

    const response = await fetch(input, {
        ...init,
        headers,
    });

    // Check if the response actually has content before parsing
    const contentType = response.headers.get("content-type");
    let payload = null;
    if (contentType && contentType.includes("application/json")) {
        payload = await response.json().catch(() => null);
    }
    
    if (!response.ok) {
        throw new Error(payload?.error || payload?.message || "Request failed");
    }

    return payload as TResponse;
}
