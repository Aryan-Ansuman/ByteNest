import { databases, users } from "@/models/server/config";
import { answerCollection, db, questionCollection } from "@/models/name";
import { Query } from "node-appwrite";
import { UserPrefs } from "@/store/Auth";
import HomeClient from "./HomeClient";
import convertDateToRelativeTime from "@/utils/relativeTime";
import slugify from "@/utils/slugify";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const Page = async ({
    searchParams,
}: {
    searchParams: { filter?: string };
}) => {
    const filter = searchParams.filter || "Newest";
    const limit = 10;

    const queries: any[] = [Query.limit(limit)];
    if (filter === "Newest" || filter === "Unanswered") {
        queries.push(Query.orderDesc("$createdAt"));
    } else if (filter === "Trending") {
        queries.push(Query.orderDesc("$createdAt"));
    }

    const [questions, totalQuestions, totalAnswers, recentQuestions, recentAnswers] =
        await Promise.all([
            databases.listDocuments(db, questionCollection, queries),
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

    // Enrich feed questions — vote total comes from the denormalized field,
    // no vote-document listing required.
    const enriched = await Promise.all(
        questions.documents.map(async (q) => {
            const [author, answers] = await Promise.all([
                users.get<UserPrefs>(q.authorId).catch(() => null),
                databases.listDocuments(db, answerCollection, [
                    Query.equal("questionId", q.$id),
                    Query.limit(1),
                ]),
            ]);

            return {
                $id: q.$id,
                title: q.title as string,
                content: q.content as string,
                tags: (q.tags as string[]) ?? [],
                $createdAt: q.$createdAt,
                totalAnswers: answers.total,
                // Read from denormalized field; default 0 for pre-migration docs.
                totalVotes: Number(q.totalVotes ?? 0),
                author: {
                    $id: author?.$id ?? "deleted",
                    name: author?.name ?? "Deleted User",
                    reputation: author?.prefs?.reputation ?? 0,
                },
            };
        })
    );

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
        .map(([tag, count]) => ({
            tag,
            questions: count * 5 + Math.floor(Math.random() * 50),
        }));

    // Community highlights
    const authorIds = Array.from(
        new Set(recentAnswers.documents.map((a) => a.authorId))
    );
    const fetchedAuthors = await Promise.all(
        authorIds.slice(0, 10).map((id) => users.get<UserPrefs>(id).catch(() => null))
    );
    const communityHighlights = fetchedAuthors
        .filter((a): a is any => a !== null)
        .sort((a, b) => (b.prefs?.reputation ?? 0) - (a.prefs?.reputation ?? 0))
        .slice(0, 3)
        .map((a) => ({ name: a.name, $id: a.$id, reputation: a.prefs?.reputation ?? 0 }));

    // Developer news
    const developerNews = recentQuestions.documents
        .filter(
            (q) =>
                (q.tags || []).includes("news") ||
                (q.tags || []).includes("announcement")
        )
        .slice(0, 3)
        .map((q) => ({
            $id: q.$id,
            title: q.title as string,
            time: convertDateToRelativeTime(new Date(q.$createdAt)),
            slug: slugify(q.title as string),
        }));

    return (
        <HomeClient
            questions={enriched}
            totalQuestions={totalQuestions.total}
            totalAnswers={totalAnswers.total}
            initialFilter={filter}
            trendingTags={trendingTags}
            communityHighlights={communityHighlights}
            developerNews={developerNews}
        />
    );
};

export default Page;
