import { databases, users } from "@/models/server/config";
import { answerCollection, db, questionCollection } from "@/models/name";
import { Query } from "node-appwrite";
import { UserPrefs } from "@/store/Auth";
import HomeClient from "./HomeClient";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";
import { deletedAuthor, getAuthorsById } from "@/lib/authors";
import { cookies } from "next/headers";
import { Account, Client } from "node-appwrite";
import env from "@/app/env";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

async function getSessionUserTags(): Promise<string[]> {
    try {
        const cookieStore = cookies();
        const sessionCookie = cookieStore.get("a_session_" + process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID);
        if (!sessionCookie) return [];

        const client = new Client()
            .setEndpoint(env.appwrite.endpoint)
            .setProject(env.appwrite.projectId)
            .setSession(sessionCookie.value);

        const account = new Account(client);
        const user = await account.get<UserPrefs>();
        return Array.isArray(user.prefs?.followedTags) ? user.prefs.followedTags : [];
    } catch {
        return [];
    }
}

const Page = async ({
    searchParams,
}: {
    searchParams: { filter?: string; cursor?: string };
}) => {
    const filter = searchParams.filter || "Newest";
    const cursor = searchParams.cursor;
    const limit = 10;

    const userTags = await getSessionUserTags();

    // Build "For you" queries — use followed tags if available, else fall back to newest
    const forYouQueries: any[] = [Query.limit(limit), Query.orderDesc("$createdAt")];
    if (userTags.length > 0) {
        // Appwrite: filter questions that contain ANY of the followed tags
        userTags.forEach((tag) => forYouQueries.push(Query.contains("tags", [tag])));
    }
    if (cursor) forYouQueries.push(Query.cursorAfter(cursor));

    const mainQueries: any[] = [Query.limit(limit)];
    if (filter === "Newest" || filter === "Unanswered") {
        mainQueries.push(Query.orderDesc("$createdAt"));
    } else if (filter === "Trending") {
        mainQueries.push(Query.orderDesc("totalVotes"));
    }
    if (cursor) mainQueries.push(Query.cursorAfter(cursor));

    // Use tag-filtered query for "For you", standard query for other filters
    const activeQueries = filter === "Newest" && userTags.length > 0 ? forYouQueries : mainQueries;

    const [questions, totalQuestions, totalAnswers, recentQuestions, recentAnswers] =
        await Promise.all([
            databases.listDocuments(db, questionCollection, activeQueries),
            databases.listDocuments(db, questionCollection, [Query.limit(1)]),
            databases.listDocuments(db, answerCollection, [Query.limit(1)]),
            databases.listDocuments(db, questionCollection, [
                Query.orderDesc("$createdAt"),
                Query.limit(50),
                Query.select(["tags", "title", "$createdAt", "$id"]),
            ]),
            databases.listDocuments(db, answerCollection, [
                Query.orderDesc("$createdAt"),
                Query.limit(50),
                Query.select(["authorId"]),
            ]),
        ]);

    const authorById = await getAuthorsById(
        questions.documents.map((q) => q.authorId as string)
    );

    const enriched = questions.documents.map((q) => {
        const author = authorById.get(q.authorId as string) ?? deletedAuthor;
        return {
            $id: q.$id,
            title: q.title as string,
            content: q.content as string,
            tags: (q.tags as string[]) ?? [],
            $createdAt: q.$createdAt,
            totalAnswers: Number(q.totalAnswers ?? 0),
            totalVotes: Number(q.totalVotes ?? 0),
            author,
        };
    });

    // Trending tags
    const tagFreq: Record<string, number> = {};
    recentQuestions.documents.forEach((q) => {
        (q.tags || []).forEach((t: string) => {
            tagFreq[t] = (tagFreq[t] || 0) + 1;
        });
    });
    const trendingTags = Object.entries(tagFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, count]) => ({ tag, questions: count }));

    // Community highlights
    const authorIds = Array.from(new Set(recentAnswers.documents.map((a) => a.authorId)));
    const recentAnswerAuthors = await getAuthorsById(authorIds.slice(0, 10));
    const communityHighlights = Array.from(recentAnswerAuthors.values())
        .filter((a) => a.$id !== "deleted")
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, 3)
        .map((a) => ({ name: a.name, $id: a.$id, reputation: a.reputation }));

    // Developer news
    const developerNews = recentQuestions.documents
        .filter((q) =>
            (q.tags || []).includes("news") || (q.tags || []).includes("announcement")
        )
        .slice(0, 3)
        .map((q) => ({
            $id: q.$id,
            title: q.title as string,
            time: convertDateToRelativeTime(new Date(q.$createdAt)),
            slug: slugify(q.title as string),
        }));

    const nextCursor =
        questions.documents.length === limit
            ? questions.documents[questions.documents.length - 1].$id
            : undefined;

    return (
        <HomeClient
            questions={enriched}
            totalQuestions={totalQuestions.total}
            totalAnswers={totalAnswers.total}
            initialFilter={filter}
            trendingTags={trendingTags}
            communityHighlights={communityHighlights}
            developerNews={developerNews}
            userHasTagPreferences={userTags.length > 0}
            nextCursor={nextCursor}
            hasMore={questions.documents.length === limit}
        />
    );
};

export default Page;
