import { cache } from "react";
import { Query } from "node-appwrite";
import { users } from "@/models/server/config";
import { UserPrefs } from "@/store/Auth";

export interface AuthorSummary {
    $id: string;
    name: string;
    reputation: number;
}

export const deletedAuthor: AuthorSummary = {
    $id: "deleted",
    name: "Deleted User",
    reputation: 0,
};

export const getAuthor = cache(async (id: string): Promise<AuthorSummary> => {
    const user = await users.get<UserPrefs>(id).catch(() => null);
    if (!user) return deletedAuthor;

    return {
        $id: user.$id,
        name: user.name,
        reputation: Number(user.prefs?.reputation ?? 0),
    };
});

export async function getAuthorsById(ids: Array<string | null | undefined>) {
    const uniqueIds = Array.from(
        new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))
    );
    const result = new Map<string, AuthorSummary>();

    if (uniqueIds.length === 0) return result;

    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIds.length; i += 100) {
        chunks.push(uniqueIds.slice(i, i + 100));
    }

    await Promise.all(
        chunks.map(async (chunk) => {
            const listed = await users
                .list<UserPrefs>([Query.equal("$id", chunk), Query.limit(chunk.length)])
                .catch(() => null);

            for (const user of listed?.users ?? []) {
                result.set(user.$id, {
                    $id: user.$id,
                    name: user.name,
                    reputation: Number(user.prefs?.reputation ?? 0),
                });
            }
        })
    );

    await Promise.all(
        uniqueIds
            .filter((id) => !result.has(id))
            .map(async (id) => {
                result.set(id, await getAuthor(id));
            })
    );

    return result;
}
