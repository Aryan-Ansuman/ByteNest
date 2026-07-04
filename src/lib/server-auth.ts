import { cookies } from "next/headers";
import { Account, Client, Models } from "node-appwrite";
import env from "@/app/env";
import { UserPrefs } from "@/store/Auth";

export async function getLoggedInUser(): Promise<Models.User<UserPrefs> | null> {
    try {
        const cookieStore = cookies();
        const sessionCookie = cookieStore.get("a_session_" + process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);
        if (!sessionCookie) return null;

        const client = new Client()
            .setEndpoint(env.appwrite.endpoint)
            .setProject(env.appwrite.projectId)
            .setSession(sessionCookie.value);

        const account = new Account(client);
        return await account.get<UserPrefs>();
    } catch {
        return null;
    }
}
