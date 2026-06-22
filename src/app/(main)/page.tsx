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
import { Suspense } from "react";
import QuestionListSkeleton from "@/components/QuestionCardSkeleton";

// This page renders personalized content ("Hey Aryan") — it MUST be fully
// dynamic. ISR would cause one user's session data to be served from cache
// to other users on a shared CDN.
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

async function HomeFeed({
    searchParams,
}: {
    searchParams: { filter?: string; cursor?: string };
}) {
    const filter = searchParams.filter || "Newest";
    const cursor = searchParams.cursor;
    const limit = 10;

    const userTags = await getSessionUserTags();

    const forYouQueries: any[] = [Query.limit(limit), Query.orderDesc("$createdAt")];
    if (userTags.length > 0) {
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

    const authorIds = Array.from(new Set(recentAnswers.documents.map((a) => a.authorId)));
    const recentAnswerAuthors = await getAuthorsById(authorIds.slice(0, 10));
    const communityHighlights = Array.from(recentAnswerAuthors.values())
        .filter((a) => a.$id !== "deleted")
        .sort((a, b) => b.reputation - a.reputation)
        .slice(0, 3)
        .map((a) => ({ name: a.name, $id: a.$id, reputation: a.reputation }));



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
            communityHighlights={communityHighlights}
            userHasTagPreferences={userTags.length > 0}
            nextCursor={nextCursor}
            hasMore={questions.documents.length === limit}
        />
    );
}

function HomeFeedSkeleton() {
    return (
        <div className="flex gap-6">
            <div className="min-w-0 flex-1 space-y-4">
                {/* Hero skeleton */}
                <div className="h-[240px] animate-pulse rounded-2xl bg-white/[0.025]" />
                {/* Feed skeleton */}
                <div className="mt-6">
                    <QuestionListSkeleton count={5} />
                </div>
            </div>
            {/* Sidebar skeleton */}
            <aside className="hidden w-72 shrink-0 space-y-4 xl:block">
                <div className="h-48 animate-pulse rounded-2xl bg-white/[0.025]" />
                <div className="h-48 animate-pulse rounded-2xl bg-white/[0.025]" />
                <div className="h-48 animate-pulse rounded-2xl bg-white/[0.025]" />
            </aside>
        </div>
    );
}

const Page = async ({
    searchParams,
}: {
    searchParams: { filter?: string; cursor?: string };
}) => {
    return (
        <Suspense fallback={<HomeFeedSkeleton />}>
            <HomeFeed searchParams={searchParams} />
        </Suspense>
    );
};

export default Page;
